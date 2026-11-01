# รันด้วย Docker + GPU (NVIDIA)

## สิ่งที่ต้องมี

- Docker Desktop (เปิด **Use the WSL 2 based engine** ใน Settings → General)
- การ์ด NVIDIA และไดรเวอร์ล่าสุด (เครื่องนี้: RTX 5060 Ti 16 GB)
- ไฟล์ `.env` (คัดลอกจาก `.env.example` แล้วแก้รหัสผ่าน MySQL)

ไม่ต้องติดตั้ง NVIDIA Container Toolkit เพิ่ม Docker Desktop ส่ง GPU ผ่าน WSL 2 ให้เอง

## เริ่มใช้งาน

1. เปิด Docker Desktop แล้วรอจนขึ้นว่ากำลังทำงาน (Engine running)
2. รันในโฟลเดอร์โปรเจกต์:

```powershell
cd C:\Users\SLK-SERVER-LLM\Desktop\express_rag
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

ไฟล์ `docker-compose.gpu.yml` คือส่วนที่ให้ container `ollama` ใช้ GPU
ถ้ารันแค่ `docker compose up -d` Ollama จะรันบน CPU และช้ากว่ามาก

ครั้งแรกจะดาวน์โหลดโมเดลหลาย GB ผ่าน service `ollama-pull` ดูความคืบหน้าได้ด้วย:

```powershell
docker compose logs -f ollama-pull
```

API จะเริ่มหลังโหลดโมเดลเสร็จ เปิด Swagger ได้ที่ http://localhost:3000/api-docs

## ตรวจว่าใช้ GPU จริง

```powershell
docker exec express_rag-ollama-1 nvidia-smi
docker exec express_rag-ollama-1 ollama ps
```

| คำสั่ง | ผลที่ควรเห็น |
|---|---|
| `nvidia-smi` | ชื่อการ์ด เช่น **NVIDIA GeForce RTX 5060 Ti** |
| `ollama ps` | ช่อง PROCESSOR เป็น **100% GPU** |

`ollama ps` จะแสดงโมเดลก็ต่อเมื่อมีการเรียกใช้แล้วอย่างน้อย 1 ครั้ง เช่น ลองยิง request จาก Swagger ก่อน

### Task Manager ขึ้น GPU แค่ 1%

กราฟ **3D** ใน Task Manager ไม่นับงาน AI (CUDA) ให้คลิกชื่อกราฟแล้วเปลี่ยนเป็น **Cuda** หรือ **Compute_0**
หรือดู **Dedicated GPU memory** แทน

## คำสั่งที่ใช้บ่อย

| งาน | คำสั่ง |
|---|---|
| ดูสถานะ container | `docker compose ps` |
| ดู log ของ API | `docker compose logs -f api` |
| ดู log ของ Ollama | `docker compose logs -f ollama` |
| rebuild เฉพาะ API หลังแก้โค้ด | `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build api` |
| หยุดทั้งหมด (ข้อมูลยังอยู่) | `docker compose down` |
| หยุดและลบข้อมูลทั้งหมด | `docker compose down -v` |

`down -v` ลบฐานข้อมูล MySQL, Qdrant, ไฟล์ที่อัปโหลด และโมเดลที่โหลดไว้ทั้งหมด

## ค่าใน `.env` ที่เกี่ยวกับ GPU และความเร็ว

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `OLLAMA_KEEP_ALIVE` | `-1` | เก็บโมเดลไว้ใน GPU นานเท่าไรหลังใช้งาน (`-1` = ตลอด) |
| `OLLAMA_WARMUP` | `true` | โหลดโมเดลแชตและ bge-m3 ตอนเปิด API ผู้ใช้คนแรกไม่ต้องรอ |
| `OLLAMA_WARMUP_OCR` | `false` | โหลดโมเดล OCR ตอนเปิดด้วย (อยู่ร่วมกับโมเดลแชต 12B ใน 16 GB ไม่ได้) |
| `OLLAMA_KV_CACHE_TYPE` | `q8_0` | เก็บ context แบบ 8-bit ใช้ VRAM ประมาณครึ่งเดียว |
| `OLLAMA_OCR_NUM_CTX` | `8192` | ขนาด context ของโมเดล OCR |
| `OLLAMA_JSON_NUM_CTX` | `8192` | ขนาด context ตอนแปลงเป็น JSON |
| `OLLAMA_JSON_FORMAT` | `off` | `off` = ไม่ลอง structured outputs (Typhoon 2.1 ไม่รองรับ) |

ถ้าเพิ่ม `*_NUM_CTX` เป็น 16384 โมเดลแชตกับ OCR จะใช้ VRAM รวมกันเกิน 16 GB
Ollama จะต้องสลับโหลดโมเดลไปมา ทำให้แต่ละ request ช้าลงหลายสิบวินาที

## แก้ปัญหา

### Docker ไม่เห็น GPU

1. อัปเดตไดรเวอร์ NVIDIA แล้ว restart Docker Desktop
2. ทดสอบ GPU กับ Docker โดยตรง:

```powershell
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

ถ้าคำสั่งนี้ไม่เห็นการ์ดเหมือนกัน แสดงว่าปัญหาอยู่ที่ Docker หรือไดรเวอร์ ไม่ใช่โปรเจกต์นี้

### `ollama ps` ขึ้น CPU

container ถูกสร้างโดยไม่ได้ใส่ไฟล์ GPU ให้รันใหม่พร้อม `-f docker-compose.gpu.yml`:

```powershell
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d
```

### `docker` ใช้ไม่ได้ (failed to connect to the docker API)

Docker Desktop ยังไม่ได้เปิด หรือยังเริ่มไม่เสร็จ เปิดแล้วรอจนขึ้น Engine running
