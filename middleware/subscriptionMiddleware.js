const checkSubscription = (prisma) => {
  return async (req, res, next) => {
    try {
      // Skip jika tidak ada userId (belum login)
      if (!req.user || !req.user.id) {
        return next();
      }

      // Cek subscription user dari database
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          subscription: {
            where: {
              status: "ACTIVE",
              endDate: {
                gte: new Date(), // Subscription masih aktif
              },
            },
          },
        },
      });

      // Jika tidak ada subscription aktif
      if (!user || !user.subscription || user.subscription.length === 0) {
        return res.status(403).json({
          error: "Subscription required",
          message:
            "Anda memerlukan subscription aktif untuk mengakses fitur ini",
        });
      }

      // Attach subscription info ke request
      req.subscription = user.subscription[0];
      next();
    } catch (error) {
      console.error("Error checking subscription:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: "Gagal memeriksa status subscription",
      });
    }
  };
};

module.exports = { checkSubscription };
