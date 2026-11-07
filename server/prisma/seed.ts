import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const VEHICLES = [
  { make: 'تويوتا', model: 'كورولا', plate: '34 MPV 786', color: 'أزرق (كحلي)', capacity: 4 },
  { make: 'تويوتا', model: 'كورولا', plate: '34 PVK 464', color: 'أبيض', capacity: 4 },
  { make: 'تويوتا', model: 'كورولا', plate: '34 TYT 101', color: 'فضي', capacity: 4 },
  { make: 'تويوتا', model: 'كورولا', plate: '34 BRC 202', color: 'أسود', capacity: 4 },
  { make: 'تويوتا', model: 'كورولا', plate: '34 KRL 303', color: 'رمادي', capacity: 4 },
  { make: 'تويوتا', model: 'كورولا', plate: '34 IST 404', color: 'أبيض', capacity: 4 },
  { make: 'تويوتا', model: 'كورولا', plate: '34 CLN 505', color: 'لؤلؤي', capacity: 4 },
  { make: 'تويوتا', model: 'كورولا', plate: '34 VIP 606', color: 'أسود ملكي', capacity: 4 },
  { make: 'تويوتا', model: 'كورولا', plate: '34 TRF 707', color: 'فضي ميتاليك', capacity: 4 },
  { make: 'تويوتا', model: 'كورولا', plate: '34 MED 808', color: 'أبيض صدفي', capacity: 4 },
];

const DRIVER_NAMES = [
  'محمد أحمد',
  'عبدالله سالم',
  'خالد المطيري',
  'يوسف الحربي',
  'سعد القحطاني',
  'فهد العنزي',
  'أحمد الزهراني',
  'عمر الدوسري',
  'بندر الشمري',
  'طلال الغامدي',
];

async function main() {
  console.log('Seeding database...');

  const adminPass = await bcrypt.hash('admin123', 10);
  const coordPass = await bcrypt.hash('coord123', 10);
  const driverPass = await bcrypt.hash('driver123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@clinic.com' },
    update: {},
    create: {
      name: 'مدير النظام',
      email: 'admin@clinic.com',
      phone: '0500000001',
      role: 'ADMIN',
      passwordHash: adminPass,
    },
  });

  await prisma.user.upsert({
    where: { email: 'coordinator@clinic.com' },
    update: {},
    create: {
      name: 'منسّق الرحلات',
      email: 'coordinator@clinic.com',
      phone: '0500000002',
      role: 'COORDINATOR',
      passwordHash: coordPass,
    },
  });

  const drivers = [];
  for (let i = 0; i < DRIVER_NAMES.length; i++) {
    const email = `driver${i + 1}@clinic.com`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        name: DRIVER_NAMES[i],
        email,
        phone: `05000000${(i + 10).toString().padStart(2, '0')}`,
        role: 'DRIVER',
        passwordHash: driverPass,
        driver: { create: { licenseNo: `LIC-${1000 + i}`, status: 'AVAILABLE' } },
      },
      include: { driver: true },
    });
    drivers.push(user.driver!);
  }

  for (let i = 0; i < VEHICLES.length; i++) {
    const v = VEHICLES[i];
    const existing = await prisma.vehicle.findUnique({ where: { plate: v.plate } });
    if (existing) {
      if (!existing.driverId) {
        await prisma.vehicle.update({ where: { id: existing.id }, data: { driverId: drivers[i].id } });
      }
      continue;
    }
    await prisma.vehicle.create({ data: { ...v, driverId: drivers[i].id } });
  }

  const patientData = [
    { name: 'سارة العتيبي', phone: '+966551112233', nationalId: '1000000001' },
    { name: 'نورة الشهري', phone: '+966552223344', nationalId: '1000000002' },
    { name: 'ريم البقمي', phone: '+966553334455', nationalId: '1000000003' },
    { name: 'هند السبيعي', phone: '+966554445566', nationalId: '1000000004' },
  ];

  const patients = [];
  for (const p of patientData) {
    const existing = await prisma.patient.findFirst({ where: { nationalId: p.nationalId } });
    const patient =
      existing ??
      (await prisma.patient.create({
        data: { name: p.name, phone: p.phone, nationalId: p.nationalId },
      }));
    patients.push(patient);
  }

  const tripsCount = await prisma.trip.count();
  if (tripsCount === 0) {
    const now = new Date();
    const at = (h: number, m: number) => {
      const d = new Date(now);
      d.setHours(h, m, 0, 0);
      return d;
    };
    const dur = (h: number, m: number) => new Date(at(h, m).getTime() + 60 * 60 * 1000);

    // Demo places in Istanbul, with real coordinates so navigation works out of the box.
    // (The clinic location is a placeholder in Sisli: set the real one when you create your trips.)
    const AIRPORT = { name: 'مطار إسطنبول', lat: 41.2753, lng: 28.7519 };
    const HOTEL = { name: 'فندق في ميدان تقسيم', lat: 41.037, lng: 28.9851 };
    const CLINIC = { name: 'عيادة النخبة الطبية - شيشلي', lat: 41.0602, lng: 28.9877 };
    const place = (o: typeof AIRPORT, d: typeof AIRPORT) => ({
      origin: o.name,
      originLat: o.lat,
      originLng: o.lng,
      destination: d.name,
      destLat: d.lat,
      destLng: d.lng,
    });

    await prisma.trip.createMany({
      data: [
        {
          patientName: 'سارة العتيبي',
          patientPhone: '+966551112233',
          driverId: drivers[0].id,
          vehicleId: (await prisma.vehicle.findUnique({ where: { plate: VEHICLES[0].plate } }))!.id,
          type: 'AIRPORT_TO_HOTEL',
          ...place(AIRPORT, HOTEL),
          scheduledAt: at(10, 30),
          endAt: dur(10, 30),
          status: 'ASSIGNED',
        },
        {
          patientName: 'نورة الشهري',
          patientPhone: '+966552223344',
          driverId: drivers[1].id,
          type: 'HOTEL_TO_CLINIC',
          ...place(HOTEL, CLINIC),
          scheduledAt: at(13, 0),
          endAt: dur(13, 0),
          status: 'ASSIGNED',
        },
        {
          patientName: 'ريم البقمي',
          patientPhone: '+966553334455',
          type: 'CLINIC_TO_HOTEL',
          ...place(CLINIC, HOTEL),
          scheduledAt: at(16, 30),
          endAt: dur(16, 30),
          status: 'SCHEDULED',
        },
      ],
    });

    await prisma.maintenance.create({
      data: {
        vehicleId: (await prisma.vehicle.findUnique({ where: { plate: VEHICLES[3].plate } }))!.id,
        type: 'ROUTINE',
        title: 'صيانة دورية 10,000 كم',
        description: 'تغيير زيت وفلتر',
        odometer: 10000,
        status: 'SCHEDULED',
      },
    });
  }

  console.log('Seed completed.');
  console.log('Accounts:');
  console.log('  admin@clinic.com / admin123');
  console.log('  coordinator@clinic.com / coord123');
  console.log('  driver1@clinic.com ... driver10@clinic.com / driver123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
