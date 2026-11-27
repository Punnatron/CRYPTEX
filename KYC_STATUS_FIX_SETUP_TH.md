# CRYPTEX — KYC Status Alignment Update

แพ็กเกจนี้ต่อยอดจากโปรเจกต์ AIE313_WebApp ที่ส่งมา โดยแก้การแสดงสถานะ KYC และการอัปเดตสถานะเอกสารหลังเจ้าหน้าที่ตัดสินใจ

## สิ่งที่แก้ไข

1. เมื่อ KYC_OFFICER เลือก **Approve** ระบบจะอัปเดต `kyc_verifications.verification_status` เป็น `APPROVED`, `customer_profiles.customer_status` เป็น `VERIFIED` และอัปเดตเอกสารที่ยัง `SUBMITTED` เป็น `VERIFIED` (หรือ `APPROVED` หาก CHECK constraint เดิมของฐานข้อมูลอนุญาตชื่อนี้แทน)
2. เมื่อเลือก **Reject** ระบบจะอัปเดตคำขอเป็น `REJECTED`, สถานะ Customer กลับเป็น `PENDING` เพื่อให้ส่งใหม่ได้ และเอกสารที่ยัง `SUBMITTED` เป็น `REJECTED` (หรือ `DECLINED` หาก CHECK constraint เดิมกำหนดไว้)
3. เมื่อเลือก **Request more information** ระบบยังเก็บสถานะ DB เป็น `PENDING` พร้อม `rejection_reason` เพื่อไม่เปลี่ยน CHECK constraint เดิม แต่หน้าเว็บจะแสดงเป็น `MORE_INFO_REQUIRED` ให้ CUSTOMER เห็นข้อความและส่งข้อมูล/เอกสารใหม่ได้
4. คำขอที่รอ CUSTOMER ส่งข้อมูลเพิ่มเติมจะไม่แสดงเป็นงานใหม่ในคิว KYC_OFFICER จนกว่าลูกค้าจะส่งใหม่
5. เอกสารของคำขอ APPROVED/REJECTED ที่มีอยู่แล้วและยังเป็น `SUBMITTED` จะถูก backfill ให้สถานะสอดคล้องเมื่อรัน SQL migration
6. หากอัปโหลดไฟล์สำเร็จแต่ RPC บันทึกคำขอไม่สำเร็จ หน้าเว็บจะพยายามลบไฟล์ที่ยังไม่ถูกอ้างอิงออกจาก Private Storage

## วิธีติดตั้ง

> ฐานข้อมูลของโปรเจกต์นี้ผ่านการติดตั้ง KYC Workflow มาแล้ว เพราะได้ทดสอบส่งและอนุมัติ KYC สำเร็จแล้ว ดังนั้นรอบนี้ให้รันเฉพาะ SQL Status Fix ด้านล่าง ไม่ต้องรัน Initial Workflow ซ้ำ

1. สำรองโฟลเดอร์ `AIE313_WebApp` เดิมไว้
2. แตก ZIP ฉบับนี้ แล้วนำไฟล์/โฟลเดอร์จาก `AIE313_WebApp` ไปวางทับโปรเจกต์เดิมที่ `C:\Users\TUF\Desktop\AIE313_WebApp`
3. เก็บไฟล์ `.env.local` และโฟลเดอร์ `.git` เดิมไว้ ZIP นี้ไม่รวมสองรายการนี้เพื่อป้องกัน keys สูญหายและรักษา Git repository เดิม ส่วน `node_modules` ที่มากับ ZIP เป็นชุดจากโปรเจกต์ Windows ที่คุณส่งมา
4. เปิด Supabase Dashboard → SQL Editor แล้วรันไฟล์นี้ทั้งไฟล์หนึ่งครั้ง:

   `supabase/AIE313_CRYPTEX_KYC_STATUS_FIX.sql`

5. เปิด Terminal ในโฟลเดอร์โปรเจกต์ แล้วรัน:

   ```bash
   npm run build
   ```

6. เมื่อ Build ผ่าน ให้ push ขึ้น GitHub เพื่อให้ Vercel Deploy:

   ```bash
   git add .
   git commit -m "Fix KYC document and review statuses"
   git push
   ```

7. หลัง Vercel Deploy สำเร็จ ให้เปิดหน้า My KYC ของ CUSTOMER แล้วกด Refresh ตรวจสอบรายการเดิม

## ตรวจสอบสถานะเอกสารใน Supabase

```sql
SELECT
    u.email,
    kv.submission_no,
    kv.verification_status,
    kv.rejection_reason,
    d.document_type,
    d.document_status,
    d.uploaded_at
FROM public.kyc_verifications AS kv
JOIN public.customer_profiles AS cp ON cp.customer_id = kv.customer_id
JOIN public.users AS u ON u.user_id = cp.user_id
LEFT JOIN public.kyc_documents AS d ON d.kyc_id = kv.kyc_id
ORDER BY kv.submitted_at DESC, d.uploaded_at DESC;
```

คำขอของ `zabit` ที่ APPROVED อยู่แล้วจะถูก backfill จาก `SUBMITTED` เป็น `VERIFIED` หากฐานข้อมูลอนุญาตค่านี้ หรือเป็น `APPROVED` หาก CHECK constraint เดิมใช้ชื่อนั้น

## ทดสอบ REJECTED และ MORE_INFO_REQUIRED

บัญชี `zabit` ถูกอนุมัติแล้ว จึงไม่ควรใช้บัญชีนี้ทดสอบการ Reject/Request more information ซ้ำ ให้สร้างบัญชี CUSTOMER ทดสอบอีกหนึ่งบัญชี และใช้ไฟล์เอกสารจำลองเท่านั้น

1. CUSTOMER ทดสอบ → My KYC → ส่งข้อมูลและไฟล์จำลอง → สถานะควรเป็น `PENDING`
2. KYC_OFFICER → Customer KYC → Review → ใส่ข้อความอธิบาย → **Request more information**
3. CUSTOMER ทดสอบ → Refresh → ต้องเห็น `MORE_INFO_REQUIRED`, ข้อความจาก Officer และฟอร์มสำหรับส่งข้อมูล/เอกสารใหม่
4. CUSTOMER ทดสอบ → ส่งข้อมูล/ไฟล์ใหม่ → สถานะกลับเป็น `PENDING`
5. KYC_OFFICER → Refresh คิว → เปิดคำขอที่ส่งใหม่ → **Reject** พร้อมเหตุผล
6. CUSTOMER ทดสอบ → Refresh → ต้องเห็น `REJECTED`, เหตุผล และฟอร์มสำหรับส่งใหม่
7. CUSTOMER ทดสอบ → ส่งใหม่อีกครั้ง แล้วให้ KYC_OFFICER เลือก **Approve** เพื่อทดสอบการเปลี่ยนสถานะเอกสารเป็น `VERIFIED`

## หมายเหตุ

- ใช้ไฟล์ JPG, PNG หรือ PDF สำหรับทดสอบ ขนาดไม่เกิน 8 MB และไม่ใช้บัตรประชาชน/พาสปอร์ตจริง
- `MORE_INFO_REQUIRED` เป็นสถานะที่หน้าเว็บคำนวณจาก `verification_status = 'PENDING'` และมี `rejection_reason` ไม่ใช่ค่าที่เขียนลงคอลัมน์โดยตรง เพื่อรักษา CHECK constraint เดิม
- SQL จะเลือกค่าของ `document_status` ที่รองรับจาก CHECK constraint เดิม โดยให้ความสำคัญกับ `VERIFIED`/`REJECTED` ก่อน หากค่าที่เลือกไม่รองรับ การเปลี่ยนสถานะ KYC จะ rollback เพื่อป้องกันข้อมูลสองตารางไม่สอดคล้องกัน
- ZIP ไม่รวม `.env.local`, `.git`, `dist` และ Supabase CLI temporary files; มี `node_modules` จากโปรเจกต์ Windows ต้นฉบับรวมอยู่ด้วย
