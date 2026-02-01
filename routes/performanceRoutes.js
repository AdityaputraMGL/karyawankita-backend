const express = require("express");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

module.exports = function (prisma) {
  const router = express.Router();

  // Middleware untuk semua endpoint performance
  router.use(authenticateToken, authorizeRole(["Admin", "HR", "Karyawan"]));

  // ⭐ GET data performance dengan filter berdasarkan role
  router.get("/", async (req, res) => {
    try {
      const userRole = req.user.role;
      const userEmployeeId = req.user.employee_id;

      console.log("📊 Fetching performance data:");
      console.log("  - User role:", userRole);
      console.log("  - User employee_id:", userEmployeeId);

      let performanceList;

      // Jika Admin atau HR, tampilkan semua data
      if (userRole === "Admin" || userRole === "HR") {
        performanceList = await prisma.performance.findMany({
          orderBy: { periode: "desc" },
          include: {
            employee: {
              select: {
                nama_lengkap: true,
                jabatan: true,
                user: {
                  select: {
                    role: true, // ⭐ Ambil role dari tabel User, bukan dari performance
                  },
                },
              },
            },
          },
        });
      }
      // Jika Karyawan, hanya tampilkan data milik mereka
      else if (userRole === "Karyawan") {
        performanceList = await prisma.performance.findMany({
          where: { employee_id: userEmployeeId },
          orderBy: { periode: "desc" },
          include: {
            employee: {
              select: {
                nama_lengkap: true,
                jabatan: true,
                user: {
                  select: {
                    role: true, // ⭐ Ambil role dari tabel User
                  },
                },
              },
            },
          },
        });
      } else {
        return res.status(403).json({ error: "Role tidak dikenali." });
      }

      console.log("  ✅ Found", performanceList.length, "records");
      res.json(performanceList);
    } catch (error) {
      console.error("❌ Error fetching performance:", error);
      res.status(500).json({
        error: "Gagal mengambil data kinerja.",
        details: error.message,
      });
    }
  });

  // ⭐ POST: Membuat data performance baru (dengan role)
  // POST: Membuat data performance baru
  router.post("/", async (req, res) => {
    const { employee_id, periode, nilai_kinerja, catatan } = req.body;

    try {
      // Validasi employee ada
      const employee = await prisma.employee.findUnique({
        where: { employee_id: parseInt(employee_id) },
      });

      if (!employee) {
        return res.status(404).json({ error: "Karyawan tidak ditemukan." });
      }

      // Simpan data performance
      const newPerformance = await prisma.performance.create({
        data: {
          employee_id: parseInt(employee_id),
          periode,
          nilai_kinerja: parseInt(nilai_kinerja),
          catatan,
        },
      });

      res.status(201).json(newPerformance);
    } catch (error) {
      console.error(error);
      res.status(400).json({ error: "Gagal membuat data kinerja baru." });
    }
  });

  // PUT: Memperbarui data performance
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { periode, nilai_kinerja, catatan } = req.body;

    const updateData = {};
    if (periode !== undefined) updateData.periode = periode;
    if (nilai_kinerja !== undefined)
      updateData.nilai_kinerja = parseInt(nilai_kinerja);
    if (catatan !== undefined) updateData.catatan = catatan;

    try {
      const updatedPerformance = await prisma.performance.update({
        where: { performance_id: parseInt(id) },
        data: updateData,
      });
      res.json(updatedPerformance);
    } catch (error) {
      console.error(error);
      res.status(400).json({ error: "Gagal memperbarui data kinerja." });
    }
  });

  // DELETE: Menghapus data performance
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await prisma.performance.delete({
        where: { performance_id: parseInt(id) },
      });
      res.json({ message: "Data kinerja berhasil dihapus." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Gagal menghapus data kinerja." });
    }
  });

  return router;
};
