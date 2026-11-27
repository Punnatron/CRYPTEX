# CRYPTEX — Customer Profile CRUD (ADMIN)

ชุดนี้เพิ่มหน้าจัดการ Customer Profiles ให้ ADMIN ทำ CRUD ครบ Create, Read, Update และ Delete ผ่าน Supabase RPC โดยไม่สร้างตารางใหม่ และไม่เปิดสิทธิ์เขียนตารางให้ผู้ใช้ทั่วไป

## ติดตั้ง Supabase (ทำครั้งเดียว)

1. เปิด Supabase Dashboard ของ Project CRYPTEX → SQL Editor → New query
2. เปิดไฟล์ `supabase/AIE313_CRYPTEX_CUSTOMER_PROFILE_CRUD.sql`
3. วาง SQL ทั้งไฟล์แล้วกด Run หนึ่งครั้ง
4. ท้ายผลลัพธ์ควรแสดง RPC 6 รายการ ได้แก่ `cryptex_is_active_admin`, `cryptex_admin_list_customer_profiles`, `cryptex_admin_list_unlinked_customer_users`, `cryptex_admin_create_customer_profile`, `cryptex_admin_update_customer_profile` และ `cryptex_admin_delete_customer_profile`

## ติดตั้ง Web App

1. ใช้โฟลเดอร์ `AIE313_WebApp` ใน ZIP นี้แทน/อัปเดตโฟลเดอร์โปรเจกต์เดิม
2. เก็บ `.env.local` เดิมไว้ (ZIP เก็บไฟล์นี้มาด้วย แต่ไม่ควรเผยแพร่ค่าในไฟล์)
3. รันใน PowerShell ที่โฟลเดอร์โปรเจกต์:

```powershell
npm run build
git add .
git commit -m "Add admin customer profile CRUD"
git push
```

Vercel จะ Deploy จาก GitHub ตามการตั้งค่าเดิม

## วิธีสาธิต CRUD

1. เข้าระบบด้วยบัญชี `ADMIN` แล้วเปิดเมนู `Customer Management`
2. **Create:** กด `Add Customer` แล้วเลือกบัญชี CUSTOMER ที่สมัครไว้แล้ว แต่ยังไม่มี Customer Profile จากนั้นกรอก Date of Birth และ Nationality แล้วกด Create Customer
3. **Read:** รายชื่อลูกค้าจะแสดงในตาราง และค้นหาด้วยชื่อ อีเมล หรือสัญชาติได้
4. **Update:** กดไอคอนดินสอ แก้ไขข้อมูล แล้วกด Save Changes
5. **Delete:** ปุ่มถังขยะใช้ได้เฉพาะ Customer Profile ที่ยังไม่มีข้อมูล KYC, Risk, AML หรือ Exchange เชื่อมอยู่ เพื่อรักษาประวัติและ Foreign Key ของฐานข้อมูล

## ขอบเขตและความปลอดภัย

- สร้าง Customer Profile ให้บัญชี CUSTOMER ที่มีอยู่แล้วเท่านั้น ไม่ได้สร้างบัญชี Login ใหม่หรือเปลี่ยน Role
- `customer_status` ถูกควบคุมโดย KYC Workflow ไม่เปิดให้แก้เองจากหน้า CRUD เพื่อไม่ให้สถานะ KYC กับสถานะลูกค้าขัดกัน
- Delete ลบเฉพาะ `customer_profiles` และจะถูกปฏิเสธหากมีประวัติ KYC, Risk, AML, Blockchain Address หรือ Accounts เชื่อมอยู่ บัญชี Auth และแถวใน `users` จะไม่ถูกลบ
- ทุกคำสั่งตรวจว่าเป็นผู้ใช้ ADMIN และ ACTIVE ฝั่ง PostgreSQL ผ่าน SECURITY DEFINER RPC; หน้าเว็บอย่างเดียวไม่ใช่ชั้นความปลอดภัย
- มีการบันทึก CREATE / UPDATE / DELETE ลง `audit_logs`
- ไม่ต้องรัน SQL ติดตั้งฐานข้อมูลหลักซ้ำ และไม่ต้องแก้ KYC workflow เดิม
