import {
  Asset,
  BASE_FEE,
  Horizon,
  Memo,
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";

const horizon = new Horizon.Server(env.horizonUrl);

export const buildUnsignedXlmPaymentXdr = async (params: {
  sourcePublicKey: string;
  destinationPublicKey: string;
  amount: string;
  memoText: string;
}) => {
  const sourceAccount = await horizon.loadAccount(params.sourcePublicKey);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: env.stellarNetworkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: params.destinationPublicKey,
        amount: params.amount,
        asset: Asset.native(),
      }),
    )
    .addMemo(Memo.text(params.memoText.slice(0, 28)))
    .setTimeout(180)
    .build();

  return tx.toXDR();
};

export const submitSignedXdr = async (signedXdr: string) => {
  const transaction = TransactionBuilder.fromXDR(
    signedXdr,
    env.stellarNetworkPassphrase,
  ) as Transaction;

  const result = await horizon.submitTransaction(transaction);
  return result.hash;
};

type ExpectedPayment = {
  sourcePublicKey: string;
  destinationPublicKey: string;
  amount: string;
};

export const verifyPaymentByHash = async (
  txHash: string,
  expected: ExpectedPayment,
) => {
  const tx = await horizon.transactions().transaction(txHash).call();
  if (!tx.successful) {
    throw new ApiError(409, "Transaction is not successful on-chain");
  }

  const opsPage = await horizon.operations().forTransaction(txHash).call();
  const paymentOp = opsPage.records.find(
    (record) => record.type === "payment",
  );

  if (!paymentOp || paymentOp.type !== "payment") {
    throw new ApiError(409, "Transaction has no payment operation");
  }

  const normalizedExpectedAmount = Number(expected.amount).toFixed(7);
  const normalizedActualAmount = Number(paymentOp.amount).toFixed(7);

  if (
    paymentOp.from !== expected.sourcePublicKey ||
    paymentOp.to !== expected.destinationPublicKey ||
    paymentOp.asset_type !== "native" ||
    normalizedExpectedAmount !== normalizedActualAmount
  ) {
    throw new ApiError(409, "On-chain payment does not match gig payout details");
  }

  return {
    txHash,
    amount: normalizedActualAmount,
    from: paymentOp.from,
    to: paymentOp.to,
  };
};
