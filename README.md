# RAG API

| ส่วน | เทคโนโลยี | หน้าที่ |
|---|---|---|
| Backend API | Express (Node.js 22) | รับไฟล์ ตอบคำถาม |
| Vector DB | Qdrant | เก็บ vector + metadata ของแต่ละ chunk |
| Structured DB | MySQL 8.4 | เก็บข้อมูลไฟล์ต้นฉบับและข้อความดิบที่ดึงออกมา |
| LLM | Ollama + `scb10x/typhoon2.1-gemma3-4b` | ตอบคำถามภาษาไทย |
| Embedding | Ollama + `bge-m3` (1024 มิติ) | แปลงข้อความเป็น vector |

ไฟล์ต้นฉบับเก็บใน volume `uploads` ส่วน MySQL เก็บชื่อไฟล์ ประเภท ขนาด สถานะ และข้อความที่ดึงออกมา

## โครงสร้าง

```
.
├── src/
│   ├── config/         env, MySQL pool, Qdrant client, Swagger
│   ├── routes/         endpoint + เอกสาร @openapi
│   ├── controllers/    รับ request / ส่ง response
│   ├── services/       document, chat, ollama, qdrant
│   ├── middlewares/    upload, notFound, error handler
│   ├── utils/          AppError, asyncHandler, chunker, textExtractor, retry
│   ├── app.js
│   └── server.js       เช็ก MySQL/Qdrant แล้วเริ่มเซิร์ฟเวอร์
├── db/init.sql         ตาราง MySQL (รันอัตโนมัติครั้งแรก)
├── Dockerfile
├── docker-compose.yml
└── docker-compose.gpu.yml   (ตัวเลือก ใช้ GPU NVIDIA)
```

## การทำงาน

**อัปโหลด** `POST /api/v1/documents`
1. บันทึกไฟล์ลงดิสก์ และสร้างแถวใน MySQL สถานะ `processing` แล้วตอบ 202 ทันที
2. เบื้องหลัง: ดึงข้อความ → แบ่ง chunk → embed ด้วย bge-m3 → บันทึกลง Qdrant
3. อัปเดตสถานะเป็น `ready` หรือ `failed` เรียก `GET /api/v1/documents/:id` เพื่อดูสถานะ

**ถามคำถาม** `POST /api/v1/chat`
1. embed คำถาม → ค้น chunk ที่ใกล้ที่สุดใน Qdrant
2. ส่ง chunk เป็นบริบทให้ Typhoon ตอบ → คืนคำตอบพร้อมแหล่งอ้างอิง

## รันด้วย Docker

ต้องเปิด Docker Desktop ก่อน

```bash
copy .env.example .env     # แล้วแก้รหัสผ่าน MySQL
docker compose up -d --build
docker compose logs -f api
```

ครั้งแรกจะดาวน์โหลดโมเดล (หลาย GB) ผ่าน service `ollama-pull` API จะเริ่มหลังโหลดเสร็จ
ดูความคืบหน้าด้วย `docker compose logs -f ollama-pull`

ถ้ามี GPU NVIDIA:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

คำสั่งอื่น:

```bash
docker compose ps          # ดูสถานะ
docker compose down        # หยุด (ข้อมูลยังอยู่)
docker compose down -v     # หยุดและลบข้อมูลทั้งหมด
```

## รันแบบไม่ใช้ Docker (dev)

ต้องมี MySQL, Qdrant และ Ollama รันอยู่ แล้วตั้งค่าใน `.env` ให้ชี้ไปที่ `localhost`

```bash
npm install
npm run dev
```

ถ้ารันเฉพาะ MySQL/Qdrant/Ollama ใน Docker: `docker compose up -d mysql qdrant ollama ollama-pull`

## API Docs (Swagger)

เปิด/ปิดด้วย `SWAGGER_ENABLED` ใน `.env` (`true` = เปิด, ค่าอื่นหรือไม่ใส่ = ปิด) ควรตั้งเป็น `false` บน production

- Swagger UI: http://localhost:3000/api-docs
- OpenAPI JSON: http://localhost:3000/api-docs.json

เขียนเอกสารแต่ละ endpoint ด้วย comment `@openapi` เหนือ route ใน `src/routes/` ส่วน schema ที่ใช้ร่วมกันอยู่ใน `src/config/swagger.js`

## Endpoints

- GET    /api/v1/health
- POST   /api/v1/documents       (multipart field `file`: .pdf, .docx, .txt, .md)
- GET    /api/v1/documents
- GET    /api/v1/documents/:id
- DELETE /api/v1/documents/:id
- POST   /api/v1/chat            `{ "question": "...", "topK": 5 }`

## ค่าที่ปรับได้ใน `.env`

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `OLLAMA_CHAT_MODEL` | `scb10x/typhoon2.1-gemma3-4b` | โมเดลตอบคำถาม |
| `OLLAMA_EMBED_MODEL` | `bge-m3` | โมเดล embedding |
| `OLLAMA_EMBED_DIMENSION` | `1024` | ต้องตรงกับโมเดล embedding |
| `RAG_CHUNK_SIZE` / `RAG_CHUNK_OVERLAP` | `1000` / `200` | ขนาด chunk (ตัวอักษร) |
| `RAG_TOP_K` | `5` | จำนวน chunk ที่ใช้ตอบ |
| `UPLOAD_MAX_FILE_SIZE_MB` | `20` | ขนาดไฟล์สูงสุด |

ถ้าเปลี่ยนโมเดล embedding ต้องลบ collection ใน Qdrant แล้วอัปโหลดเอกสารใหม่ เพราะ vector เดิมใช้ร่วมกันไม่ได้
