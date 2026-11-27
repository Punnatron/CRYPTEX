# CRYPTEX — Customer KYC CRUD

## สิ่งที่เพิ่ม
- ปุ่ม `Add Customer` แสดงเฉพาะผู้ใช้ Role `ADMIN`
- สร้าง Customer Profile ให้บัญชี `CUSTOMER` ที่สมัครไว้แล้วและยังไม่มี Profile
- แก้ไข `nationality` และ `customer_status`
- ลบ Customer Profile โดยไม่ลบบัญชี Supabase Auth หรือแถวใน `users`
- จำกัด INSERT / UPDATE / DELETE ใน PostgreSQL ด้วย RLS สำหรับ ADMIN ที่มีสถานะ ACTIVE เท่านั้น

## ติดตั้ง

1. สำรองโฟลเดอร์โปรเจกต์เดิม และแตกไฟล์ ZIP ชุดนี้ทับ/รวมเข้ากับ `AIE313_WebApp` เดิม
2. **เก็บไฟล์ `.env.local` เดิมไว้** ZIP นี้ไม่รวมไฟล์ดังกล่าว
3. เปิด Supabase Dashboard ของ Project 313 → SQL Editor แล้วรันไฟล์ `supabase/admin_customer_profile_crud.sql` หนึ่งครั้ง
4. ในโฟลเดอร์โปรเจกต์ รัน:

   ```bash
   npm install
   npm run build
   ```

5. Commit และ Push ไฟล์ที่แก้ไขขึ้น GitHub เพื่อให้ Vercel Deploy เวอร์ชันใหม่

## วิธีทดสอบ

1. สมัครบัญชีทดสอบใหม่ผ่านหน้า Register โดยใช้ข้อมูลทดสอบและให้บัญชีนั้นมี Role `CUSTOMER` / Status `ACTIVE`
2. ออกจากระบบบัญชีทดสอบ แล้วเข้าสู่ระบบด้วย `ADMIN`
3. เปิด `Customer KYC` → `Add Customer`
4. เลือกบัญชี Customer ที่เพิ่งสมัคร ใส่ Nationality แล้วกด `Create Customer`
5. ทดสอบ Edit โดยเปลี่ยน Nationality หรือ Customer Status แล้วตรวจว่าค่าเปลี่ยนในตาราง
6. ทดสอบ Delete กับโปรไฟล์ทดสอบที่ยังไม่มี KYC / Risk records อ้างอิง

## ขอบเขตและข้อควรทราบ

- `Add Customer` ในหน้านี้สร้างแถวใน `customer_profiles` ให้บัญชี Customer ที่มีอยู่แล้ว ไม่ได้สร้างรหัสผ่านหรือบัญชี Supabase Auth ใหม่ ลูกค้าต้องสมัครผ่าน Register ก่อน
- Delete ลบเฉพาะ `customer_profiles` ไม่ลบบัญชีเข้าสู่ระบบใน `auth.users` หรือ `public.users`
- หาก Customer Profile ถูกอ้างอิงโดย KYC verification, KYC documents, risk assessment หรือข้อมูลอื่นที่มี Foreign Key การลบอาจถูก PostgreSQL ปฏิเสธเพื่อรักษาความสัมพันธ์ของข้อมูล ให้ใช้ Edit เปลี่ยนสถานะเป็น `SUSPENDED` แทน
- `KYC_OFFICER` ยังดูข้อมูลได้ แต่ไม่มีปุ่มเพิ่ม แก้ไข หรือลบ
- SQL นี้เพิ่ม write permission เฉพาะคอลัมน์ `customer_id`, `user_id`, `nationality`, `customer_status` สำหรับ INSERT และ `nationality`, `customer_status` สำหรับ UPDATE พร้อม DELETE เฉพาะแถวที่ RLS อนุญาต
