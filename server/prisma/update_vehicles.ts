import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ISTANBUL_COROLLAS = [
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

async function main() {
  const existing = await prisma.vehicle.findMany({ orderBy: { createdAt: 'asc' } });
  console.log(`Found ${existing.length} vehicles.`);

  for (let i = 0; i < existing.length; i++) {
    const v = existing[i];
    const data = ISTANBUL_COROLLAS[i % ISTANBUL_COROLLAS.length];
    // Suffix plate if duplicates would occur
    const plate = i < ISTANBUL_COROLLAS.length ? data.plate : `34 CRL ${100 + i}`;

    await prisma.vehicle.update({
      where: { id: v.id },
      data: {
        make: data.make,
        model: data.model,
        plate: plate,
        color: data.color,
        capacity: data.capacity,
      },
    });
    console.log(`Updated vehicle ${v.id} to ${data.make} ${data.model} - ${plate} (${data.color})`);
  }

  console.log('All vehicles updated to Toyota Corolla with Istanbul plates!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
