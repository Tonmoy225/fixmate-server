require("dotenv").config();
const { connectDB, collections } = require("./db");

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const daysAhead = (n) => new Date(Date.now() + n * DAY);

// Placeholder ছবি। পরে ImgBB-তে আসল ছবি তুলে এই লিংক বদলাতে পারো।
const img = (text) =>
  `https://placehold.co/800x600/0f172a/f97316?text=${encodeURIComponent(text).replace(/%20/g, "+")}`;

// tech: 0 = প্রথম technician, 1 = দ্বিতীয় technician
const serviceData = [
  { title: "iPhone Screen Replacement", category: "Smartphone", basePrice: 45, estimatedDuration: "2-3 hours", serviceMode: "Home Visit", serviceArea: "Dhanmondi, Dhaka", tech: 0, description: "Original quality display replacement for all iPhone models with 3 months warranty on the new screen." },
  { title: "Android Battery Replacement", category: "Smartphone", basePrice: 25, estimatedDuration: "1-2 hours", serviceMode: "Shop Drop-off", serviceArea: "Mirpur, Dhaka", tech: 1, description: "Quick battery change for Samsung, Xiaomi, Oppo and other Android phones. Includes a battery health check." },
  { title: "Laptop Servicing & Cleaning", category: "Laptop & PC", basePrice: 30, estimatedDuration: "1 day", serviceMode: "Shop Drop-off", serviceArea: "Uttara, Dhaka", tech: 0, description: "Full internal cleaning, thermal paste change and fan check to fix overheating and slow performance." },
  { title: "Laptop Screen & Keyboard Repair", category: "Laptop & PC", basePrice: 60, estimatedDuration: "1-2 days", serviceMode: "Shop Drop-off", serviceArea: "Mirpur, Dhaka", tech: 1, description: "Replacement of cracked laptop screens and faulty keyboards for most popular brands." },
  { title: "AC Gas Refill & Servicing", category: "AC", basePrice: 40, estimatedDuration: "2 hours", serviceMode: "Home Visit", serviceArea: "Gulshan, Dhaka", tech: 1, description: "Gas leak check, gas refill and full servicing for split and window AC units at your home." },
  { title: "Split AC Deep Cleaning", category: "AC", basePrice: 35, estimatedDuration: "2-3 hours", serviceMode: "Home Visit", serviceArea: "Banani, Dhaka", tech: 0, description: "Indoor and outdoor unit deep cleaning to improve cooling and reduce your electricity bill." },
  { title: "Refrigerator Compressor Repair", category: "Refrigerator", basePrice: 70, estimatedDuration: "1 day", serviceMode: "Home Visit", serviceArea: "Mohammadpur, Dhaka", tech: 1, description: "Diagnosis and repair or replacement of refrigerator compressors, with a written warranty." },
  { title: "Fridge Cooling Problem Fix", category: "Refrigerator", basePrice: 35, estimatedDuration: "2-3 hours", serviceMode: "Home Visit", serviceArea: "Dhanmondi, Dhaka", tech: 0, description: "Fix for fridges that are not cooling well, including thermostat, door seal and fan checks." },
  { title: "LED TV Panel & Backlight Repair", category: "TV", basePrice: 55, estimatedDuration: "1-2 days", serviceMode: "Shop Drop-off", serviceArea: "Farmgate, Dhaka", tech: 1, description: "Backlight strip and panel repair for LED and LCD televisions of all major brands." },
  { title: "Smart TV Software & Setup", category: "TV", basePrice: 20, estimatedDuration: "1 hour", serviceMode: "Home Visit", serviceArea: "Uttara, Dhaka", tech: 0, description: "Software update, app setup, Wi-Fi connection and fixing common smart TV errors." },
  { title: "Washing Machine Motor Repair", category: "Washing Machine", basePrice: 50, estimatedDuration: "3-4 hours", serviceMode: "Home Visit", serviceArea: "Mirpur, Dhaka", tech: 1, description: "Motor, belt and bearing repair for front-load and top-load washing machines." },
  { title: "Washing Machine Drain Fix", category: "Washing Machine", basePrice: 30, estimatedDuration: "2 hours", serviceMode: "Home Visit", serviceArea: "Banani, Dhaka", tech: 0, description: "Fix for water not draining, drain pump blockage and leaking hoses." },
  { title: "House Electrical Wiring", category: "Electrical", basePrice: 45, estimatedDuration: "1 day", serviceMode: "Home Visit", serviceArea: "Gulshan, Dhaka", tech: 0, description: "Safe new wiring and rewiring for rooms and apartments by an experienced electrician." },
  { title: "Switchboard & Fan Repair", category: "Electrical", basePrice: 15, estimatedDuration: "1-2 hours", serviceMode: "Home Visit", serviceArea: "Dhanmondi, Dhaka", tech: 1, description: "Switchboard, socket and ceiling fan repair or replacement at your doorstep." },
  // admin approval page-এর জন্য
  { title: "Tablet Screen Repair", category: "Smartphone", basePrice: 40, estimatedDuration: "1 day", serviceMode: "Shop Drop-off", serviceArea: "Uttara, Dhaka", tech: 0, approvalStatus: "pending", description: "Screen replacement for iPad and Android tablets." },
  { title: "Desktop PC Assembly", category: "Laptop & PC", basePrice: 25, estimatedDuration: "3 hours", serviceMode: "Home Visit", serviceArea: "Mirpur, Dhaka", tech: 1, approvalStatus: "rejected", description: "Custom desktop PC assembly and setup." },
];

// booking-এর status অনুযায়ী statusHistory
const historySteps = {
  requested: ["requested"],
  accepted: ["requested", "accepted"],
  "in-progress": ["requested", "accepted", "in-progress"],
  completed: ["requested", "accepted", "in-progress", "completed"],
  rejected: ["requested", "rejected"],
  cancelled: ["requested", "cancelled"],
};

async function seed() {
  await connectDB();

  // ১. technician আর customer খোঁজা
  const technicians = await collections.users
    .find({ role: "technician" })
    .sort({ createdAt: 1 })
    .limit(2)
    .toArray();
  const customer = await collections.users.findOne({ role: "customer" });

  if (technicians.length < 2) {
    throw new Error("Please create 2 technician accounts from the Sign Up page first.");
  }
  if (!customer) {
    throw new Error("Please create 1 customer account from the Sign Up page first.");
  }

  // ২. আগের seed data মুছে ফেলা (শুধু seed: true)
  await collections.payments.deleteMany({ seed: true });
  await collections.bookings.deleteMany({ seed: true });
  await collections.services.deleteMany({ seed: true });

  // ৩. service বানানো (নতুনগুলো আগে দেখানোর জন্য createdAt আলাদা)
  const services = serviceData.map((item, index) => ({
    title: item.title,
    category: item.category,
    description: item.description,
    image: img(item.title),
    basePrice: item.basePrice,
    estimatedDuration: item.estimatedDuration,
    serviceMode: item.serviceMode,
    serviceArea: item.serviceArea,
    technicianName: technicians[item.tech].name,
    technicianEmail: technicians[item.tech].email,
    approvalStatus: item.approvalStatus || "approved",
    isAvailable: true,
    createdAt: daysAgo(40 - index * 2),
    seed: true,
  }));

  const serviceResult = await collections.services.insertMany(services);
  const ids = serviceResult.insertedIds;
  const saved = services.map((service, index) => ({ ...service, _id: ids[index] }));

  // ৪. booking বানানো: (service-এর index, status, finalAmount, paymentStatus)
  const plans = [
    { s: 0, status: "requested", note: "The screen is cracked and the touch is not working on the right side.", age: 1 },
    { s: 2, status: "accepted", note: "My laptop gets very hot and shuts down while I am working.", age: 3 },
    { s: 5, status: "in-progress", note: "The AC is making noise and the cooling is very weak this summer.", age: 5 },
    { s: 7, status: "completed", final: 40, pay: "unpaid", note: "The fridge is not cooling properly and the freezer has too much ice.", age: 8 },
    { s: 9, status: "completed", final: 25, pay: "paid", note: "The smart TV is stuck on the logo screen after a software update.", age: 12 },
    { s: 1, status: "rejected", note: "The phone battery drains in two hours even when I do not use it.", age: 7 },
    { s: 4, status: "cancelled", note: "The AC is not cooling and I think the gas is leaking from the pipe.", age: 6 },
    { s: 10, status: "completed", final: 55, pay: "paid", note: "The washing machine makes a loud noise and stops in the middle of a wash.", age: 15 },
    { s: 6, status: "requested", note: "The compressor sounds very loud and the fridge stops cooling at night.", age: 2 },
  ];

  const bookings = plans.map((plan, index) => {
    const service = saved[plan.s];
    const created = daysAgo(plan.age);
    const steps = historySteps[plan.status];

    return {
      serviceId: String(service._id),
      serviceTitle: service.title,
      serviceImage: service.image,
      category: service.category,
      basePrice: service.basePrice,
      technicianName: service.technicianName,
      technicianEmail: service.technicianEmail,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: "01700000000",
      address: "House 12, Road 5, Dhanmondi, Dhaka",
      preferredDate: plan.status === "requested" ? daysAhead(index + 1) : daysAgo(plan.age - 1),
      problemDescription: plan.note,
      status: plan.status,
      finalAmount: plan.final || service.basePrice,
      paymentStatus: plan.pay || "unpaid",
      statusHistory: steps.map((status, i) => ({
        status,
        changedAt: new Date(created.getTime() + i * 3 * 60 * 60 * 1000),
      })),
      createdAt: created,
      seed: true,
    };
  });

  const bookingResult = await collections.bookings.insertMany(bookings);

  // ৫. paid booking-এর জন্য payment record
  const payments = [];
  bookings.forEach((booking, index) => {
    if (booking.paymentStatus !== "paid") return;
    const bookingId = String(bookingResult.insertedIds[index]);

    payments.push({
      bookingId,
      serviceTitle: booking.serviceTitle,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      technicianName: booking.technicianName,
      technicianEmail: booking.technicianEmail,
      amount: booking.finalAmount,
      currency: "usd",
      transactionId: `pi_seed_${bookingId}`,
      stripeSessionId: `cs_seed_${bookingId}`,
      paymentStatus: "paid",
      paidAt: new Date(booking.createdAt.getTime() + 2 * DAY),
      seed: true,
    });
  });

  if (payments.length > 0) {
    await collections.payments.insertMany(payments);
  }

  console.log("Seed completed:");
  console.log(`- Services: ${services.length} (${services.filter((s) => s.approvalStatus === "approved").length} approved)`);
  console.log(`- Bookings: ${bookings.length}`);
  console.log(`- Payments: ${payments.length}`);
  console.log(`- Technicians used: ${technicians[0].email}, ${technicians[1].email}`);
  console.log(`- Customer used: ${customer.email}`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error.message);
    process.exit(1);
  });