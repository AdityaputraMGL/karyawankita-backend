const express = require("express");
const jwt = require("jsonwebtoken");

const JWT_SECRET =
  process.env.JWT_SECRET || "ganti_dengan_secret_key_yang_kuat";

module.exports = function (prisma, passport) {
  const router = express.Router();

  // ✅ Initiate Google OAuth
  router.get(
    "/google",
    passport.authenticate("google", {
      scope: ["profile", "email"],
      session: false,
    })
  );

  // ✅ Google OAuth Callback
  router.get(
    "/google/callback",
    passport.authenticate("google", {
      session: false,
      failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_auth_failed`,
    }),
    async (req, res) => {
      try {
        const user = req.user;

        console.log("✅ Google OAuth successful for:", user.username);

        // Generate JWT token
        const token = jwt.sign(
          {
            userId: user.user_id,
            username: user.username,
            role: user.role,
            employee_id: user.employee?.employee_id || null,
          },
          JWT_SECRET,
          { expiresIn: "24h" }
        );

        // Redirect ke frontend dengan token
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
        res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
      } catch (error) {
        console.error("❌ Error in Google callback:", error);
        res.redirect(
          `${process.env.FRONTEND_URL}/login?error=token_generation_failed`
        );
      }
    }
  );

  return router;
};
