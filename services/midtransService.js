// services/midtransService.js
const midtransClient = require("midtrans-client");

class MidtransService {
  constructor() {
    this.snap = new midtransClient.Snap({
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
      serverKey: process.env.MIDTRANS_SERVER_KEY,
      clientKey: process.env.MIDTRANS_CLIENT_KEY,
    });

    this.coreApi = new midtransClient.CoreApi({
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
      serverKey: process.env.MIDTRANS_SERVER_KEY,
      clientKey: process.env.MIDTRANS_CLIENT_KEY,
    });

    console.log("✅ Midtrans Service initialized");
    console.log(
      "  - Environment:",
      process.env.MIDTRANS_IS_PRODUCTION === "true" ? "PRODUCTION" : "SANDBOX"
    );
  }

  /**
   * Create Snap Transaction
   */
  async createTransaction(orderId, amount, customerDetails, itemDetails) {
    try {
      console.log("🔄 Creating Midtrans transaction...");
      console.log("  - Order ID:", orderId);
      console.log("  - Amount:", amount);

      const parameter = {
        transaction_details: {
          order_id: orderId,
          gross_amount: amount,
        },
        customer_details: customerDetails,
        item_details: itemDetails,
        credit_card: {
          secure: true,
        },
        callbacks: {
          finish: `${process.env.FRONTEND_URL}/subscription/success`,
          error: `${process.env.FRONTEND_URL}/subscription/failed`,
          pending: `${process.env.FRONTEND_URL}/subscription/pending`,
        },
      };

      const transaction = await this.snap.createTransaction(parameter);

      console.log("✅ Midtrans transaction created");
      console.log("  - Token:", transaction.token);
      console.log("  - Redirect URL:", transaction.redirect_url);

      return {
        token: transaction.token,
        redirect_url: transaction.redirect_url,
      };
    } catch (error) {
      console.error("❌ Midtrans transaction error:", error);
      throw error;
    }
  }

  /**
   * Check Transaction Status
   */
  async checkStatus(orderId) {
    try {
      console.log("🔍 Checking transaction status:", orderId);
      const status = await this.coreApi.transaction.status(orderId);

      console.log("✅ Transaction status:", status.transaction_status);
      return status;
    } catch (error) {
      console.error("❌ Error checking status:", error);
      throw error;
    }
  }

  /**
   * Verify Webhook Notification
   */
  async verifyNotification(notification) {
    try {
      console.log("🔔 Verifying webhook notification...");

      const statusResponse = await this.coreApi.transaction.notification(
        notification
      );

      console.log("✅ Notification verified");
      console.log("  - Order ID:", statusResponse.order_id);
      console.log("  - Status:", statusResponse.transaction_status);
      console.log("  - Fraud Status:", statusResponse.fraud_status);

      return {
        orderId: statusResponse.order_id,
        transactionStatus: statusResponse.transaction_status,
        fraudStatus: statusResponse.fraud_status,
        paymentType: statusResponse.payment_type,
        transactionId: statusResponse.transaction_id,
        transactionTime: statusResponse.transaction_time,
        grossAmount: statusResponse.gross_amount,
      };
    } catch (error) {
      console.error("❌ Webhook verification error:", error);
      throw error;
    }
  }

  /**
   * Determine if payment is successful
   */
  isPaymentSuccess(transactionStatus, fraudStatus) {
    return (
      (transactionStatus === "capture" && fraudStatus === "accept") ||
      transactionStatus === "settlement"
    );
  }

  /**
   * Determine if payment is pending
   */
  isPaymentPending(transactionStatus) {
    return transactionStatus === "pending";
  }

  /**
   * Determine if payment failed
   */
  isPaymentFailed(transactionStatus) {
    return ["deny", "expire", "cancel"].includes(transactionStatus);
  }
}

module.exports = MidtransService;
