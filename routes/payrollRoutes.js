const express = require("express");
const { authenticateToken, authorizeRole } = require("../middleware/auth");

module.exports = function (prisma) {
  const router = express.Router();

  // ✅ ENDPOINT KHUSUS UNTUK KARYAWAN - Melihat slip gaji sendiri
  // Harus ditempatkan SEBELUM middleware authorizeRole untuk Admin/HR
  router.get("/my-slip", authenticateToken, async (req, res) => {
    try {
      const employeeId = req.user.employeeId; // Dari token JWT

      // Ambil slip gaji hanya untuk karyawan yang login
      const myPayrolls = await prisma.payroll.findMany({
        where: { employee_id: employeeId },
        orderBy: { periode: "desc" },
        include: {
          employee: {
            select: {
              nama_lengkap: true,
              jabatan: true,
            },
          },
        },
      });

      res.json(myPayrolls);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Gagal mengambil slip gaji Anda." });
    }
  });

  // Middleware untuk endpoint Admin/HR - diterapkan setelah endpoint karyawan
  router.use(authenticateToken, authorizeRole(["Admin", "HR"]));

  // ⭐ GET semua data payroll (Admin & HR only)
  router.get("/", async (req, res) => {
    try {
      const payrolls = await prisma.payroll.findMany({
        orderBy: { periode: "desc" },
        include: {
          employee: { select: { nama_lengkap: true, jabatan: true } },
        },
      });
      res.json(payrolls);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Gagal mengambil data payroll." });
    }
  });

  // ⭐ POST: Membuat data payroll baru (Admin & HR only)
  router.post("/", async (req, res) => {
    const {
      employee_id,
      periode,
      gaji_pokok,
      tunjangan,
      potongan,
      alasan_potongan,
      total_gaji,
      employee_role,
    } = req.body;

    // Konversi string ke angka
    const data = {
      employee_id: parseInt(employee_id),
      periode, // Format 'YYYY-MM'
      gaji_pokok: parseFloat(gaji_pokok),
      tunjangan: parseFloat(tunjangan || 0),
      potongan: parseFloat(potongan || 0),
      alasan_potongan: alasan_potongan || null,
      total_gaji: parseFloat(total_gaji),
      employee_role,
    };

    try {
      const newPayroll = await prisma.payroll.create({ data });
      res.status(201).json(newPayroll);
    } catch (error) {
      console.error(error);
      if (error.code === "P2002") {
        return res.status(400).json({
          error: "Data payroll untuk periode dan karyawan ini sudah ada.",
        });
      }
      res.status(400).json({ error: "Gagal membuat data payroll." });
    }
  });

  // ⭐ PUT: Memperbarui data payroll (Admin & HR only)
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const {
      gaji_pokok,
      tunjangan,
      potongan,
      alasan_potongan,
      total_gaji,
      employee_role,
    } = req.body;

    const updateData = {};
    if (gaji_pokok !== undefined)
      updateData.gaji_pokok = parseFloat(gaji_pokok);
    if (tunjangan !== undefined) updateData.tunjangan = parseFloat(tunjangan);
    if (potongan !== undefined) updateData.potongan = parseFloat(potongan);
    if (alasan_potongan !== undefined)
      updateData.alasan_potongan = alasan_potongan;
    if (total_gaji !== undefined)
      updateData.total_gaji = parseFloat(total_gaji);
    if (employee_role !== undefined) updateData.employee_role = employee_role;

    try {
      const updatedPayroll = await prisma.payroll.update({
        where: { payroll_id: parseInt(id) },
        data: updateData,
      });
      res.json(updatedPayroll);
    } catch (error) {
      console.error(error);
      res.status(400).json({ error: "Gagal memperbarui data payroll." });
    }
  });

  // ⭐ DELETE: Menghapus data payroll (Admin & HR only)
  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await prisma.payroll.delete({
        where: { payroll_id: parseInt(id) },
      });
      res.json({ message: "Data payroll berhasil dihapus." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Gagal menghapus data payroll." });
    }
  });

  return router;
};
