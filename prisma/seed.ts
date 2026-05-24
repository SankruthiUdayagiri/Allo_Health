import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Cleaning up database...");
  await prisma.reservation.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.idempotencyRecord.deleteMany();

  console.log("Seeding Warehouses...");
  const wMumbai = await prisma.warehouse.create({
    data: {
      name: "Mumbai Central Hub",
      location: "Mumbai, MH",
      region: "West",
    },
  });

  const wBengaluru = await prisma.warehouse.create({
    data: {
      name: "Bengaluru Tech Logistics",
      location: "Bengaluru, KA",
      region: "South",
    },
  });

  const wDelhi = await prisma.warehouse.create({
    data: {
      name: "Delhi NCR Depot",
      location: "New Delhi, DL",
      region: "North",
    },
  });

  console.log("Seeding Products...");
  const products = [
    {
      sku: "ALLO-ED-DAILY",
      name: "Allo Daily ED Vitality Pack (1-Month)",
      description: "A clinically formulated, daily supplement blend designed to enhance blood flow, support natural testosterone levels, and boost performance over time.",
      price: 1499.00,
      imageUrl: "/images/ed-vitality-pack.png",
    },
    {
      sku: "ALLO-ED-DAILY-3M",
      name: "Allo Daily ED Vitality Pack (3-Month)",
      description: "Value bundle of our popular ED supplement packs. Formulated with L-Arginine, Ginseng, and clinical micronutrients for sustainable bedroom wellness.",
      price: 3999.00,
      imageUrl: "/images/ed-vitality-pack.png",
    },
    {
      sku: "ALLO-PE-SPRAY",
      name: "Allo Performance Endurance Spray (Single)",
      description: "Fast-acting, discreet topical spray formulated with Lidocaine to reduce over-sensitivity and delay climax, helping you build stamina and confidence.",
      price: 899.00,
      imageUrl: "/images/endurance-spray.png",
    },
    {
      sku: "ALLO-PE-SPRAY-2P",
      name: "Allo Performance Endurance Spray (Double)",
      description: "Double pack of our top-rated Performance Spray. Keeps you ready and confident. Dermatologically approved for sensitive skin.",
      price: 1599.00,
      imageUrl: "/images/endurance-spray.png",
    },
    {
      sku: "ALLO-FEM-DESIRE",
      name: "Allo Female Desire Supplements (1-Month)",
      description: "An adaptogenic herbal blend tailored for women to regulate stress hormones, elevate natural lubrication, and restore healthy libido levels.",
      price: 1299.00,
      imageUrl: "/images/female-supplements.png",
    },
    {
      sku: "ALLO-FEM-DESIRE-3M",
      name: "Allo Female Desire Supplements (3-Month)",
      description: "Value subscription tier of our female endocrine and hormone balance supplements. Enhances natural vitality, mood, and lubrication levels.",
      price: 3499.00,
      imageUrl: "/images/female-supplements.png",
    },
    {
      sku: "ALLO-INTIM-KIT",
      name: "Allo Couples Intimacy Connection Kit",
      description: "A luxurious selection of dermatologist-tested organic intimacy lubricants, botanical massage oils, and card games designed to cultivate sexual intimacy.",
      price: 2499.00,
      imageUrl: "/images/intimacy-kit.png",
    },
    {
      sku: "ALLO-INTIM-KIT-DLX",
      name: "Allo Deluxe Couples Intimacy Kit",
      description: "Our premium connection kit containing standard intimacy lubricants, plus a silk blindfold, aromatherapy candles, and advanced intimacy conversation decks.",
      price: 3999.00,
      imageUrl: "/images/intimacy-kit.png",
    },
  ];

  const dbProducts = [];
  for (const prod of products) {
    const dbP = await prisma.product.create({
      data: prod,
    });
    dbProducts.push(dbP);
  }

  console.log("Seeding Inventories...");
  const warehouses = [wMumbai, wBengaluru, wDelhi];

  // Let's seed unique inventory counts for each product-warehouse combination
  for (let i = 0; i < dbProducts.length; i++) {
    const product = dbProducts[i];
    for (let j = 0; j < warehouses.length; j++) {
      const warehouse = warehouses[j];
      
      // Determine a realistic stock count based on indices
      let totalUnits = 20;
      if (product.sku === "ALLO-PE-SPRAY" && warehouse.id === wMumbai.id) {
        totalUnits = 5; // Exactly 5 units for stress test verification
      } else if (i % 3 === 0 && j === 0) {
        totalUnits = 3; // Low stock
      } else if (i % 4 === 1 && j === 2) {
        totalUnits = 0; // Out of stock
      } else if (i === 6 && j === 1) {
        totalUnits = 1; // Extremely low stock
      }

      await prisma.inventory.create({
        data: {
          productId: product.id,
          warehouseId: warehouse.id,
          totalUnits,
          reservedUnits: 0,
        },
      });
    }
  }

  console.log("Database seeded successfully!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
