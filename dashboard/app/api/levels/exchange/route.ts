/**
 * GET /api/levels/exchange — get exchange preview
 * POST /api/levels/exchange — exchange levels for tokens
 */

import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logger } from "@/utils/logger";
import type { ExchangePreview, ExchangeResponse } from "@/types/levels";

export async function GET() {
  try {
    const session = await getSession();
    const discordId = session.user?.id;

    if (!discordId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    await connect();
    const { default: User } = await import("@/models/UserModel.js");

    const user = await User.findOne({ discordId });
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // User.findOne() returns a document instance, not lean, so methods are available
    const exchangeData = user.getExchangeableLevels();
    const preview: ExchangePreview = {
      exchangeableLevels: exchangeData.exchangeableLevels,
      potentialTokens: exchangeData.potentialTokens,
      currentLevel: exchangeData.currentLevel,
      lastExchangedLevel: exchangeData.lastExchangedLevel,
      totalLevelsExchanged: user.leveling?.totalLevelsExchanged || 0,
      currentTokenBalance: user.tokens || 0,
    };

    return NextResponse.json(preview);
  } catch (e) {
    logger.error("api/levels/exchange", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch exchange preview" },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const session = await getSession();
    const discordId = session.user?.id;

    if (!discordId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    await connect();
    const { default: User } = await import("@/models/UserModel.js");

    const user = await User.findOne({ discordId });
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get balance before exchange
    const balanceBefore = user.tokens || 0;

    // Exchange levels for tokens using the model method
    const result = await user.exchangeLevelsForTokens();

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message } as ExchangeResponse,
        { status: 400 }
      );
    }

    // Update tokens balance
    user.tokens = balanceBefore + result.tokensReceived;
    await user.save();

    // Get balance after exchange
    const balanceAfter = user.tokens;

    // Log transaction to TokenTransactionModel
    try {
      const { default: TokenTransaction } = await import("@/models/TokenTransactionModel.js");
      await (TokenTransaction as unknown as {
        createTransaction: (data: {
          userId: string;
          amount: number;
          type: string;
          category: string;
          description: string;
          balanceBefore: number;
          balanceAfter: number;
        }) => Promise<unknown>;
      }).createTransaction({
        userId: discordId,
        amount: result.tokensReceived,
        type: 'earned',
        category: 'level-exchange',
        description: `Exchanged ${result.levelsExchanged} level(s) for tokens`,
        balanceBefore,
        balanceAfter,
      });
    } catch (transactionError) {
      // Log error but don't fail the exchange
      logger.error(
        "api/levels/exchange",
        `Failed to log transaction: ${transactionError instanceof Error ? transactionError.message : String(transactionError)}`
      );
    }

    const response: ExchangeResponse = {
      success: true,
      levelsExchanged: result.levelsExchanged,
      tokensReceived: result.tokensReceived,
      newLevel: result.currentLevel,
    };

    return NextResponse.json(response);
  } catch (e) {
    logger.error("api/levels/exchange", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { success: false, error: "Failed to exchange levels" } as ExchangeResponse,
      { status: 500 }
    );
  }
}
