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
    const user = await User.findOne({ discordId }).lean() as { tokens?: number } | null;
    const currentBalance = user?.tokens || 0;

    // Get transaction summary
    const summary = await (TokenTransaction as unknown as { getUserTransactionSummary: (id: string) => Promise<{ totalEarned: number; totalSpent: number; totalTransactions: number }> }).getUserTransactionSummary(discordId);

    // Get recent transactions
    const recentTransactions = await (TokenTransaction as unknown as { getUserTransactions: (id: string, limit: number, offset: number) => Promise<TokenTransaction[]> }).getUserTransactions(discordId, 50, 0);

    return NextResponse.json({
      currentBalance,
      totalEarned: summary.totalEarned,
      totalSpent: summary.totalSpent,
      totalTransactions: summary.totalTransactions,
      transactions: recentTransactions.map((t) => ({
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
