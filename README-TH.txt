CRYPTEX Chat Query Update (Groq + Supabase RLS)

ไฟล์ในชุดนี้
1) supabase/functions/cryptex-chat/index.ts
   - Edge Function ใช้ Groq openai/gpt-oss-20b
   - ตรวจ Supabase Auth และ Role จาก users
   - ใช้ JWT ของผู้ใช้ในการอ่าน Views เพื่อให้ RLS มีผล
   - จำกัด Query ด้วย Tool/View ที่กำหนดไว้ ไม่อนุญาตให้ LLM สร้าง SQL อิสระ
   - รองรับ KYC latest, Customer Risk, AML Investigation, Blockchain Risk,
     Transaction History, Daily Transaction Summary และ Account Asset Balance
   - ส่ง evidence (tool, view, SQL, rows) กลับไป Frontend

2) src/components/Chatbot.jsx
   - แสดงคำตอบภาษาไทย
   - แสดง Tool, View, SQL และตารางผลลัพธ์จาก Supabase
   - แสดงคำถามแนะนำแยกตาม Role

3) src/components/Chatbot.css
   - Layout ของ Evidence Panel และ Raw Result Table

วิธีติดตั้ง
- สำรองไฟล์เดิมก่อน
- แทนที่ไฟล์ 3 จุดตาม path ใน ZIP
- รัน npm run build
- หาก Build ผ่าน ให้ commit/push ไฟล์ src/components/* ขึ้น GitHub
- Deploy Edge Function ด้วย:
  npx --yes supabase@latest functions deploy cryptex-chat --project-ref ubvgrzdiyyywujwkvhfl --use-api
- จากนั้นทดสอบ Chat ตามรายการในแชท

ข้อควรทราบ
- ไม่ใช้ Service Role Key; ทุก query ใช้ JWT ผู้ใช้และ RLS เดิม
- Query เป็น read-only และใช้เฉพาะ View ที่ allowlist ไว้
- CUSTOMER ต้องถามข้อมูลของตนเองด้วยคำอย่าง “ของฉัน” / “my ...”
- AML_ANALYST ไม่สามารถถาม KYC list ผ่าน Chat แม้ฐานข้อมูลบางตารางมี RLS SELECT ให้ role นี้
- การ aggregate KYC/AML ถูก group ใน Edge Function จาก rows ที่อ่านได้จาก View;
  ส่วน v_daily_transaction_summary เป็น View ที่ aggregate ใน PostgreSQL อยู่แล้ว


KYC STATUS ALIGNMENT UPDATE
---------------------------
ดูคู่มือ KYC_STATUS_FIX_SETUP_TH.md สำหรับการแก้สถานะเอกสารหลัง APPROVE/REJECT
และการทดสอบ MORE_INFO_REQUIRED / REJECTED แบบครบ workflow

SQL migration ใหม่: supabase/AIE313_CRYPTEX_KYC_STATUS_FIX.sql
เนื่องจาก KYC Workflow ในฐานข้อมูลนี้ติดตั้งและทดสอบแล้ว ให้รัน Status Fix SQL
เพียงไฟล์เดียวตามคู่มือ ไม่ต้องรัน Initial Workflow ซ้ำ

ADMIN CUSTOMER PROFILE CRUD
---------------------------
ดูคู่มือ CRUD_SETUP_TH.md สำหรับหน้า Customer Management ของ ADMIN
และวิธีติดตั้ง SQL migration ที่ supabase/AIE313_CRYPTEX_CUSTOMER_PROFILE_CRUD.sql
ฟังก์ชัน CRUD ทำผ่าน Supabase RPC ที่ตรวจ ADMIN/ACTIVE และบันทึก Audit Log
ไม่ต้องสร้างตารางใหม่หรือรัน SQL ติดตั้งฐานข้อมูลหลักซ้ำ
