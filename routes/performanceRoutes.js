const express = require("express");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

module.exports = function (prisma) {
  const router = express.Router();

  // Middleware untuk semua endpoint performance (Hanya Admin/HR yang boleh mengelola)
  router.use(authenticateToken, authorizeRole(["Admin", "HR"]));

  // ⭐ GET semua data performance
  router.get("/", async (req, res) => {
    try {
      const performanceList = await prisma.performance.findMany({
        orderBy: { periode: "desc" },
        include: {
          employee: { select: { nama_lengkap: true, jabatan: true } },
        },
      });
      res.json(performanceList);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Gagal mengambil data kinerja." });
    }
  });

  // ⭐ POST: Membuat data performance baru
  router.post("/", async (req, res) => {
    const { employee_id, periode, nilai_kinerja, catatan } = req.body;

    try {
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

  // ⭐ PUT: Memperbarui data performance
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

  // ⭐ DELETE: Menghapus data performance
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
