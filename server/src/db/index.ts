import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function initDb() {
  // Test connection
  await prisma.$connect();
  console.log('✅ Database connected');

  // Seed default data if not exists
  const configCount = await prisma.systemConfig.count();
  if (configCount === 0) {
    await prisma.systemConfig.createMany({
      data: [
        { configKey: 'system_prompt', configValue: '你是一个专业的视频内容助手，能够根据视频转写内容回答用户的问题。请基于提供的上下文准确、详细地回答问题。' },
        { configKey: 'site_title', configValue: 'HearSight - AI 视频智能分析' },
        { configKey: 'admin_password', configValue: 'admin123' },
      ],
      skipDuplicates: true,
    });
    console.log('✅ Default config seeded');
  }

  // Seed default settings
  const settingCount = await prisma.systemSetting.count();
  if (settingCount === 0) {
    await prisma.systemSetting.create({
      data: { key: 'allow_registration', value: 'true' },
    });
    console.log('✅ Default settings seeded');
  }

  // Seed admin user if not exists
  const adminExists = await prisma.user.findUnique({
    where: { username: 'admin' },
  });
  if (!adminExists) {
    const bcrypt = await import('bcrypt');
    const passwordHash = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: {
        username: 'admin',
        passwordHash,
        email: 'admin@hearsight.com',
        isAdmin: true,
        isActive: true,
      },
    });
    console.log('✅ Admin user created (admin/admin123)');
  }
}

export async function closeDb() {
  await prisma.$disconnect();
}
