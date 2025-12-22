// middleware/auth.js
const jwt = require("jsonwebtoken");

// ✅ Ambil JWT_SECRET dari environment variable
const JWT_SECRET =
  process.env.JWT_SECRET || "ganti_dengan_secret_key_yang_kuat";

console.log("🔐 Auth middleware loaded");
console.log("  - JWT_SECRET:", JWT_SECRET.substring(0, 20) + "...");

// Middleware untuk memverifikasi JWT
function authenticateToken(req, res, next) {
  // Ambil Authorization header (case-insensitive)
  const authHeader =
    req.headers["authorization"] || req.headers["Authorization"];

  console.log("\n🔐 Auth Middleware:");
  console.log("  - URL:", req.method, req.originalUrl);
  console.log("  - Authorization header:", authHeader ? "EXISTS" : "MISSING");

  if (!authHeader) {
    console.error("  ❌ No Authorization header");
    return res.status(401).json({
      error: "Token tidak ditemukan. Silakan login.",
      details: "Authorization header is missing",
    });
  }

  // Extract token dari "Bearer TOKEN"
  const parts = authHeader.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    console.error("  ❌ Invalid Authorization format");
    return res.status(401).json({
      error: "Format Authorization header tidak valid.",
      details: "Expected format: Bearer <token>",
    });
  }

  const token = parts[1];
  console.log("  - Token extracted:", token.substring(0, 30) + "...");
  console.log("  - Token length:", token.length);

  // Verify token
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error("  ❌ Token verification FAILED");
      console.error("    - Error:", err.message);
      console.error("    - Error type:", err.name);

      if (err.name === "TokenExpiredError") {
        return res.status(403).json({
          error: "Token sudah expired. Silakan login kembali.",
          details: `Token expired at: ${err.expiredAt}`,
        });
      }

      if (err.name === "JsonWebTokenError") {
        return res.status(403).json({
          error: "Token tidak valid.",
          details: err.message,
        });
      }

      return res.status(403).json({
        error: "Token tidak valid atau sudah kadaluwarsa.",
      });
    }

    console.log("  ✅ Token valid!");
    console.log("    - User ID:", decoded.userId || decoded.id);
    console.log("    - Username:", decoded.username);
    console.log("    - Role:", decoded.role);
    console.log("    - Employee ID:", decoded.employee_id);

    // Attach user info to request object
    req.user = decoded;

    // ✅ PINDAHKAN KE SINI: Block pending users (HARUS DI DALAM jwt.verify callback)
    // ✅ BLOCK PENDING USERS (kecuali endpoint complete-profile)
    if (decoded.status === "pending") {
      // Izinkan akses HANYA ke endpoint complete-profile
      if (req.originalUrl.includes("/complete-profile")) {
        console.log(
          "  ⚠️ Pending user accessing complete-profile endpoint - ALLOWED"
        );
        next();
        return;
      }

      console.error("  ❌ User status: pending - Access denied");
      return res.status(403).json({
        error:
          "Akun Anda masih menunggu approval dari Admin. Silakan tunggu atau hubungi administrator.",
        status: "pending",
        code: "ACCOUNT_PENDING",
      });
    }

    // ✅ BLOCK REJECTED USERS
    if (decoded.status === "rejected") {
      console.error("  ❌ User status: rejected");
      return res.status(403).json({
        error:
          "Akun Anda telah ditolak oleh Admin. Silakan hubungi administrator untuk informasi lebih lanjut.",
        status: "rejected",
        code: "ACCOUNT_REJECTED",
      });
    }

    // ✅ ONLY ALLOW ACTIVE USERS
    if (decoded.status !== "active") {
      console.error("  ❌ User status:", decoded.status);
      return res.status(403).json({
        error: "Status akun Anda tidak valid. Silakan hubungi administrator.",
        status: decoded.status,
        code: "INVALID_STATUS",
      });
    }

    console.log("  ✅ User status: active");
    next();
  });
}

// Middleware untuk otorisasi berdasarkan Role
function authorizeRole(roles) {
  return (req, res, next) => {
    console.log("\n🔒 Role Authorization:");
    console.log("  - Required roles:", roles);
    console.log("  - User role:", req.user?.role);

    if (!req.user) {
      console.error("  ❌ User tidak terautentikasi");
      return res.status(401).json({
        error: "Anda harus login terlebih dahulu.",
      });
    }

    if (!roles.includes(req.user.role)) {
      console.error("  ❌ Access denied - insufficient permissions");
      return res.status(403).json({
        error: "Anda tidak memiliki akses ke resource ini.",
        details: `Required roles: ${roles.join(", ")}, Your role: ${
          req.user?.role
        }`,
      });
    }

    console.log("  ✅ Role authorization passed");
    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRole,
};
