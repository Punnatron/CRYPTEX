CRYPTEX — AIE313 WebApp
======================

โปรเจกต์นี้ประกอบด้วย React + Vite + Supabase, Role-based access, Dashboard, AML Monitoring และ AI Assistant (Groq).

การอัปเดต Customer KYC Workflow
--------------------------------
- CUSTOMER: มีเมนู My KYC ใน Sidebar ของหน้า My Dashboard และปุ่ม Open My KYC บน Dashboard
- CUSTOMER: กรอกข้อมูลส่วนตัว เลือกชนิดเอกสาร อัปโหลด JPG/PNG/PDF (ไม่เกิน 8 MB) และติดตามสถานะ
- KYC_OFFICER: ตรวจคิวคำขอ เปิดดูเอกสาร และ Approve / Reject / Request more information
- ADMIN: ดูภาพรวมคำขอ KYC โดยไม่มีสิทธิ์กดอนุมัติ
- เอกสารเก็บใน Supabase Storage แบบ Private
- Database writes ใช้ SECURITY DEFINER RPC ที่ตรวจ role และผู้เป็นเจ้าของไฟล์ ไม่เปิด DML ให้ Frontend โดยตรง

ติดตั้ง
-------
1. แตก ZIP แล้วนำโฟลเดอร์ AIE313_WebApp ไปวางทับโฟลเดอร์โปรเจกต์เดิม โดยเลือก Replace files
2. เก็บ .env.local และ .git เดิมไว้ (ZIP ไม่รวมไฟล์ทั้งสองนี้)
3. Supabase Dashboard > SQL Editor แล้วรัน supabase/AIE313_CRYPTEX_KYC_WORKFLOW.sql
4. Terminal ในโฟลเดอร์โปรเจกต์:
   npm install
   npm run build
5. เมื่อ Build ผ่าน:
   git add .
   git commit -m "Add customer KYC workflow"
   git push
6. ตรวจ Vercel deployment จากนั้น login เป็น CUSTOMER แล้วเปิดเมนู My KYC

คู่มือภาษาไทยฉบับเต็ม: KYC_WORKFLOW_SETUP_TH.md

หมายเหตุ
--------
- SQL KYC migration นี้ต้องรันหลัง RLS migration เดิม เพราะใช้ public.cryptex_has_role(text[])
- อย่าปิด RLS และอย่าใส่ Supabase Service Role Key ใน Frontend
- KYC_OFFICER ที่อนุมัติคำขอต้องมี public.kyc_officers.officer_id ตรงกับ public.users.user_id และ officer_status = ACTIVE
- ZIP ไม่รวม .env.local, .git, node_modules และ dist เพื่อเก็บ credentials/repository เดิมและให้ build จาก source ล่าสุด
- ใช้ข้อมูล/ไฟล์ทดสอบสำหรับการสาธิตเท่านั้น ไม่ควรอัปโหลดบัตรประชาชนหรือเอกสารจริง

Chatbot
-------
- Edge Function อยู่ที่ supabase/functions/cryptex-chat/index.ts
- ใช้ Groq openai/gpt-oss-20b และ Supabase Auth/RLS ของผู้เรียก
- Query แบบ read-only จำกัดตาม Tool/View ที่กำหนด ไม่อนุญาตให้ LLM สร้าง SQL อิสระ
- Deploy Edge Function ด้วยคำสั่ง:
  npx --yes supabase@latest functions deploy cryptex-chat --project-ref ubvgrzdiyyywujwkvhfl --use-api
