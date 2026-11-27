# CRYPTEX — ติดตั้ง Customer KYC Workflow

ชุดนี้เป็น **โปรเจกต์ AIE313_WebApp ฉบับรวมไฟล์แก้ไขแล้ว** ไม่ใช่ patch ที่ต้องคัดลอกไฟล์ทีละไฟล์

## สิ่งที่เพิ่มและแก้ในโปรเจกต์

### CUSTOMER
- เพิ่มเมนู **My KYC** ใน Sidebar ของหน้า My Dashboard (ตัว Sidebar ที่ Dashboard ใช้งานจริง)
- เพิ่มปุ่ม **Open My KYC** บนหน้า Dashboard
- กรอกวันเกิด สัญชาติ อาชีพ และรายได้ต่อเดือน
- เลือก Passport / National ID / Driving License
- กรอกเลขเอกสารแบบปกปิดบางส่วน และวันหมดอายุ
- อัปโหลดไฟล์ JPG / PNG / PDF ขนาดไม่เกิน 8 MB
- ดูสถานะคำขอและข้อความจากเจ้าหน้าที่
- แก้ไขและส่งใหม่ได้เมื่อถูกปฏิเสธหรือเจ้าหน้าที่ขอข้อมูลเพิ่มเติม

### KYC_OFFICER
- ดูคิวคำขอที่รอตรวจสอบ
- เปิดดูเอกสารผ่าน Signed URL จาก Private Storage
- Approve, Reject หรือ Request more information
- ต้องมีแถว `public.kyc_officers` ที่ `officer_id` ตรงกับ `public.users.user_id` และ `officer_status = 'ACTIVE'`

### ADMIN
- ดูภาพรวมคำขอ KYC และรายละเอียดลูกค้า/เอกสาร
- ไม่มีปุ่มอนุมัติคำขอ เพราะการตัดสินใจถูกจำกัดให้ KYC_OFFICER

### Security / Database
- ใช้ Private Supabase Storage bucket ชื่อ `kyc-documents`
- เพิ่ม RPC `cryptex_submit_kyc` และ `cryptex_review_kyc` สำหรับเขียนข้อมูลแทนการเปิดสิทธิ์ DML ให้ browser
- ตรวจ role, account status และ path เจ้าของเอกสารในฝั่งฐานข้อมูล
- ไม่ปิด RLS และไม่ใช้ Service Role Key ใน Frontend
- ปรับ sequence ของ `submission_no` ให้เริ่มต่อจากเลขสูงสุดที่มีอยู่ เพื่อไม่ชนข้อมูล demo เดิม
- Request more information จัดเก็บเป็นสถานะ `PENDING` พร้อมข้อความเจ้าหน้าที่ เพื่อไม่เพิ่ม status ใหม่ที่อาจชน CHECK constraint เดิม ลูกค้าจะเห็นข้อความและส่งข้อมูลใหม่ได้

## วิธีนำโปรเจกต์ฉบับแก้ไขไปใช้

1. สำรองโฟลเดอร์ `AIE313_WebApp` เดิมไว้ก่อน
2. แตก ZIP นี้ แล้วนำโฟลเดอร์ `AIE313_WebApp` จากใน ZIP ไปวางทับโปรเจกต์เดิมที่ `C:\Users\TUF\Desktop\AIE313_WebApp` โดยเลือก **Replace files** เมื่อ Windows ถาม
3. ZIP นี้ตั้งใจไม่รวม `.git`, `.env.local`, `node_modules` และไฟล์ `.vercel` เพื่อไม่เขียนทับ Git repository, credential หรือ local dependencies เดิม ให้เก็บ `.env.local` ของคุณไว้เหมือนเดิม
4. เปิด Supabase Dashboard → SQL Editor แล้วรันไฟล์ `supabase/AIE313_CRYPTEX_KYC_WORKFLOW.sql` ทั้งไฟล์หนึ่งครั้ง
5. ที่ Terminal ใน `AIE313_WebApp` รัน:

   ```bash
   npm install
   npm run build
   ```

6. เมื่อ Build ผ่าน ให้ push source ขึ้น GitHub เพื่อให้ Vercel Deploy:

   ```bash
   git add .
   git commit -m "Add customer KYC workflow"
   git push
   ```

7. เปิด `https://cryptex-iota.vercel.app/dashboard` ด้วยบัญชี CUSTOMER แล้วจะเห็นเมนู **My KYC** และปุ่ม **Open My KYC**

## ตั้งค่า KYC_OFFICER

ตรวจสอบบัญชีเจ้าหน้าที่ใน Supabase SQL Editor:

```sql
SELECT
  u.user_id,
  u.email,
  u.role,
  u.account_status,
  ko.officer_status
FROM public.users AS u
LEFT JOIN public.kyc_officers AS ko
  ON ko.officer_id = u.user_id
WHERE upper(u.role) = 'KYC_OFFICER';
```

บัญชีที่จะกด Approve / Reject ได้ ต้องมี role `KYC_OFFICER`, account `ACTIVE` และมีแถวใน `kyc_officers` ที่ officer_status เป็น `ACTIVE` หากยังไม่มีแถว ให้เพิ่มผ่าน SQL Editor โดยใช้ `user_id` ของเจ้าหน้าที่จริงเท่านั้น

## ลำดับทดสอบ

1. Login เป็น CUSTOMER → My KYC → กรอกข้อมูลและอัปโหลดไฟล์ → Submit
2. ตรวจว่าขึ้น PENDING และมีแถวใน `customer_profiles`, `kyc_verifications`, `kyc_documents`
3. Login เป็น KYC_OFFICER → Customer KYC → Review → เปิดเอกสาร → Approve หรือ Reject
4. Login เป็น CUSTOMER อีกครั้ง → Refresh My KYC → ตรวจผลและข้อความจากเจ้าหน้าที่
5. Login เป็น ADMIN → Customer KYC → ตรวจภาพรวมคำขอ

## หมายเหตุสำคัญ

- SQL ต้องรันหลังจาก CRYPTEX RLS migration เดิม เพราะใช้ helper `public.cryptex_has_role(text[])` ที่มีอยู่แล้ว
- ไม่ต้องรัน RLS migration เดิมซ้ำ และอย่าปิด RLS
- หาก Supabase Auth account มีอยู่แต่ไม่มีแถวใน `public.users` หรือ role/status ไม่ตรง CUSTOMER/ACTIVE ฟังก์ชันจะปฏิเสธการส่ง KYC
- เอกสารที่อัปโหลดเป็นข้อมูลส่วนบุคคล ควรใช้ไฟล์ทดสอบเท่านั้นสำหรับการสาธิตในชั้นเรียน และไม่ควรอัปโหลดเอกสารจริง
- ZIP ไม่รวม `.env.local` เพื่อป้องกันการเผยแพร่ keys; ให้เก็บไฟล์ local และ Vercel environment variables เดิมไว้
