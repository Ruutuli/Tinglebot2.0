/**
 * GET /api/users/tokens
 * Get user's token balance and transaction history
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { connect } from "@/lib/db";

type TokenTransaction = {
  _id: unknown;
  amount: number;
  type: string;
  category: string;
  description: string;
  link: string;
  balanceBefore: number;
  balanceAfter: number;
  timestamp: Date;
};

type TokenSummary = {
  totalEarned: number;
  totalSpent: number;
  totalTransactions: number;
};

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connect();

    const User = (await import("@/models/UserModel.js")).default;
    const TokenTransaction = (await import("@/models/TokenTransactionModel.js")).default;

    const discordId = session.user.id;

    // Get user's current token balance from UserModel
    const user = await User.findOne({ discordId }).lean() as { _id?: unknown; tokens?: number } | null;
    const currentBalance = user?.tokens || 0;

    // Get transaction summary
    const summary = await (TokenTransaction as unknown as {
      getUserTransactionSummary: (id: string) => Promise<TokenSummary>;
    }).getUserTransactionSummary(discordId);

    // Get recent transactions
    const recentTransactions = await (TokenTransaction as unknown as { getUserTransactions: (id: string, limit: number, offset: number) => Promise<TokenTransaction[]> }).getUserTransactions(discordId, 50, 0);

    // -----------------------------------------------------------------------
    // Legacy adjustment:
    // If transactions do not cover the user's full current balance (common for
    // older accounts created before TokenTransaction logging), add a synthetic
    // "legacy balance" entry so the Dashboard reflects ALL token activity.
    // -----------------------------------------------------------------------
    const netFromTransactions = (summary.totalEarned || 0) - (summary.totalSpent || 0);
    const legacyDelta = currentBalance - netFromTransactions;

    const getUserCreatedAt = (): Date => {
      const id: unknown = user?._id;
      const maybeObjId = id as { getTimestamp?: () => Date };
      if (maybeObjId && typeof maybeObjId.getTimestamp === "function") {
        return maybeObjId.getTimestamp();
      }
      // Fallback: far in the past so it sorts first in charts.
      return new Date("2000-01-01T00:00:00.000Z");
    };

    const legacyTransaction =
      legacyDelta !== 0
        ? {
            id: "legacy-balance",
            amount: Math.abs(legacyDelta),
            type: legacyDelta >= 0 ? "earned" : "spent",
            category: "legacy",
            description: "Legacy balance (pre-transaction history)",
            link: "",
            balanceBefore: legacyDelta >= 0 ? 0 : Math.abs(legacyDelta),
            balanceAfter: legacyDelta >= 0 ? legacyDelta : 0,
            timestamp: getUserCreatedAt(),
          }
        : null;

    const adjustedTotalEarned =
      legacyDelta > 0 ? (summary.totalEarned || 0) + legacyDelta : (summary.totalEarned || 0);
    const adjustedTotalSpent =
      legacyDelta < 0 ? (summary.totalSpent || 0) + Math.abs(legacyDelta) : (summary.totalSpent || 0);
    const adjustedTotalTransactions =
      (summary.totalTransactions || 0) + (legacyTransaction ? 1 : 0);

    return NextResponse.json({
      currentBalance,
      totalEarned: adjustedTotalEarned,
      totalSpent: adjustedTotalSpent,
      totalTransactions: adjustedTotalTransactions,
      transactions: [
        ...recentTransactions.map((t) => ({
        id: String(t._id),
        amount: t.amount,
        type: t.type,
        category: t.category,
        description: t.description,
        link: t.link,
        balanceBefore: t.balanceBefore,
        balanceAfter: t.balanceAfter,
        timestamp: t.timestamp,
      })),
        ...(legacyTransaction ? [legacyTransaction] : []),
      ],
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[tokens/route.ts]❌ Error fetching token data:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
