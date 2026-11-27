# CRYPTEX — Final KYC + Exchange Access Update

## สิ่งที่อัปเดต
- Dashboard ของ CUSTOMER แสดงสถานะ KYC และคำแนะนำตามสถานะล่าสุด
- REJECTED ใช้ข้อความมาตรฐานภาษาอังกฤษเมื่อเจ้าหน้าที่ไม่ได้กรอกเหตุผลเอง
- CUSTOMER เห็นเหตุผลการปฏิเสธและคำแนะนำว่าสามารถแก้ไข/ส่งคำขอใหม่ได้
- การส่งใหม่หลัง REJECTED หรือ MORE INFO REQUESTED ใช้ workflow เดิมและออก submission number ใหม่
- เพิ่ม SQL restrictive RLS policy ให้ CUSTOMER อ่าน/เขียนข้อมูลในตารางบัญชีและธุรกรรมที่กำหนดได้ต่อเมื่อ KYC เป็น APPROVED เท่านั้น ส่วน ADMIN/KYC_OFFICER/AML_ANALYST ไม่ถูกจำกัดด้วย policy นี้

## ติดตั้ง
1. สำรองโฟลเดอร์โปรเจกต์เดิมก่อนแตก ZIP และ Merge/Replace ไฟล์ โดยเก็บ `.git` และ `.env.local` เดิมไว้
2. เปิด Supabase → SQL Editor → New query
3. เปิดและรันเฉพาะ `supabase/AIE313_CRYPTEX_KYC_ACCESS_CONTROL_FINAL.sql` หนึ่งครั้ง หลังจากที่ติดตั้ง KYC Workflow และ RLS เดิมแล้ว
4. ใน Terminal ที่โฟลเดอร์โปรเจกต์ รัน:

```bash
npm install
npm run build
git add .
git commit -m "Finalize KYC messaging and exchange access gate"
git push
```

5. รอ Vercel Deployment เป็น Ready แล้วทดสอบตามรายการด้านล่าง

## Test checklist
- CUSTOMER ที่ NOT SUBMITTED / PENDING / MORE INFO REQUESTED / REJECTED: Dashboard แสดงสถานะและคำแนะนำ และไม่สามารถอ่านข้อมูลบัญชี/ยอดคงเหลือ/ธุรกรรม/คำสั่งซื้อ/การโอนผ่านตารางที่ถูกป้องกันได้
- CUSTOMER ที่ APPROVED: ฟังก์ชันตรวจสอบ KYC คืนค่า true; สิทธิ์การอ่านข้อมูลในตารางที่ถูกป้องกันยังขึ้นกับ ownership policy เดิมด้วย
- KYC_OFFICER และ ADMIN: ยังเข้าถึงหน้าตรวจ KYC ตาม role เดิมได้
- REJECTED: CUSTOMER เห็นเหตุผลและฟอร์ม resubmit; เอกสารที่เคยส่งยังปรากฏใน Submitted documents

## ข้อจำกัดที่ต้องทราบ
- CRYPTEX ปัจจุบันยังไม่มีหน้าใช้งานจริงสำหรับลูกค้าสร้างคำสั่งซื้อขาย/ฝากถอนใน route Accounts & Assets และ Transactions; หน้าเหล่านั้นยังเป็นส่วน Admin placeholder ตามโครงงานเดิม ดังนั้นการอัปเดตนี้ทำการบังคับสิทธิ์ที่ระดับฐานข้อมูล ไม่ได้สร้างระบบซื้อขายหรือฝากถอนใหม่
- โครงสร้างปัจจุบันเก็บ `kyc_verifications` หนึ่งแถวต่อลูกค้า การ resubmit จะอัปเดต verification record เดิมและเพิ่ม submission number ใหม่; แถวเอกสารเดิมยังคงอยู่ใน `kyc_documents` แต่ไม่ได้สร้างตาราง audit history แยกสำหรับทุกสถานะ review
- SQL ใช้ restrictive RLS policy เพิ่มเติมร่วมกับ policies เดิม ไม่ได้ยกเลิก RLS หรือให้สิทธิ์ Service Role ใน browser
