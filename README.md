# Express API Starter

## โครงสร้าง

```
.
├── src/
│   ├── config/         ตั้งค่าและอ่าน environment variables
│   ├── routes/         กำหนด endpoint แล้วส่งต่อไป controller
│   ├── controllers/    รับ request / ส่ง response
│   ├── services/       business logic และการเข้าถึงข้อมูล
│   ├── middlewares/    notFound, error handler (เพิ่ม auth, validate ได้)
│   ├── utils/          AppError, asyncHandler
│   ├── app.js          ตั้งค่า Express app
│   └── server.js       จุดเริ่มรันเซิร์ฟเวอร์
├── .env.example
└── package.json
```

Flow: `Request → routes → controllers → services → Response`

## เริ่มใช้งาน

```bash
npm install
copy .env.example .env
npm run dev
```

## API Docs (Swagger)

เปิด/ปิดด้วย `SWAGGER_ENABLED` ใน `.env` (`true` = เปิด, ค่าอื่นหรือไม่ใส่ = ปิด)
ควรตั้งเป็น `false` บน production

- Swagger UI: http://localhost:3000/api-docs
- OpenAPI JSON: http://localhost:3000/api-docs.json

เขียนเอกสารแต่ละ endpoint ด้วย comment `@openapi` เหนือ route ในโฟลเดอร์ `src/routes/`
ส่วน schema ที่ใช้ร่วมกันอยู่ใน `src/config/swagger.js`

## Endpoints

- GET    /api/v1/health
- GET    /api/v1/users
- GET    /api/v1/users/:id
- POST   /api/v1/users
- PUT    /api/v1/users/:id
- DELETE /api/v1/users/:id
