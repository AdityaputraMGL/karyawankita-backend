// seed-plans.js
// Script untuk populate subscription plans ke database
// PRICING: Per Karyawan Per Bulan

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const plans = [
  {
    plan_name: "Basic HRIS",
    price: 10000, // Rp 10.000 per karyawan per bulan
    duration_days: 30,
    max_employees: null, // Unlimited (hitung per employee)
    features: JSON.stringify([
      "Employee Management",
      "Attendance (Clock In / Clock Out)",
      "Leave Management",
      "Payroll Basic (manual + kalkulator)",
    ]),
    is_active: true,
  },
  {
    plan_name: "Standard HRIS",
    price: 15000, // Rp 15.000 per karyawan per bulan
    duration_days: 30,
    max_employees: null,
    features: JSON.stringify([
      "Semua fitur Basic HRIS",
      "Work Schedule (Flat / Shift)",
      "Overtime Management & Approval",
      "Attendance Report",
    ]),
    is_active: true,
  },
  {
    plan_name: "Pro HRIS",
    price: 20000, // Rp 20.000 per karyawan per bulan
    duration_days: 30,
    max_employees: null,
    features: JSON.stringify([
      "Semua fitur Standard HRIS",
      "Dashboard Grafik & Summary",
      "Payroll dengan Overtime Calculation",
      "Billing & Invoice Management (Dummy)",
    ]),
    is_active: true,
  },
];

async function seedPlans() {
  console.log("🌱 Starting to seed subscription plans...");

  try {
    // Cek apakah sudah ada plans
    const existingPlans = await prisma.subscriptionPlan.findMany();

    if (existingPlans.length > 0) {
      console.log("⚠️  Plans already exist in database!");
      console.log(`   Found ${existingPlans.length} existing plans:`);
      existingPlans.forEach((p) => {
        console.log(
          `   - ${p.plan_name}: Rp ${Number(p.price).toLocaleString(
            "id-ID"
          )} / karyawan / bulan`
        );
      });

      console.log("\n❓ Deleting old plans and creating new ones...");

      // Delete old data
      console.log("🗑️  Deleting existing data...");
      await prisma.payment.deleteMany({});
      await prisma.subscription.deleteMany({});
      await prisma.subscriptionPlan.deleteMany({});
      console.log("✅ Old data deleted");
    }

    // Create plans
    console.log("\n📝 Creating subscription plans...");

    for (const plan of plans) {
      const created = await prisma.subscriptionPlan.create({
        data: plan,
      });
      console.log(
        `✅ Created: ${created.plan_name} - Rp ${Number(
          created.price
        ).toLocaleString("id-ID")} / karyawan / bulan`
      );
    }

    console.log("\n🎉 Seeding completed successfully!");
    console.log("\n📊 Summary:");
    console.log(`   - Total plans created: ${plans.length}`);
    console.log("\n💰 Pricing Model:");
    console.log("   - Basic HRIS: Rp 10.000 / karyawan / bulan");
    console.log("   - Standard HRIS: Rp 15.000 / karyawan / bulan");
    console.log("   - Pro HRIS: Rp 20.000 / karyawan / bulan");
    console.log("\n💡 Next steps:");
    console.log("   1. Start backend: npm start");
    console.log("   2. Start frontend: npm start");
    console.log("   3. Login as Admin");
    console.log("   4. Visit /pricing to see plans");
    console.log(
      "   5. System will calculate: Total = Jumlah Karyawan × Harga Plan"
    );
  } catch (error) {
    console.error("\n❌ Error seeding plans:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run seed
seedPlans().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
