# GitLawb AI (V3 Premium) 🚀

GitLawb AI, **Ollama (Local LLM), Kafka, MinIO ve Qdrant** altyapısı üzerine inşa edilmiş, kurumsal seviyede otonom bir yapay zeka ajanı ve RAG (Retrieval-Augmented Generation) platformudur. Claude V3 hissi veren, ultra premium, cam görünümlü (glassmorphism) modern bir arayüzle kod parçacıklarını ve ajan düşünce (trace) süreçlerini dinamik "Artifact" pencerelerinde gösterir.

## 🔥 Öne Çıkan Özellikler (Features)

- 🤖 **Otonom Ajan (Autonomous Agent):** Görevleri kendi basamaklarına bölen, düşünen (Thought), aksiyon alan (Action) ve sonuçları gözlemleyen (Observation) akıllı "ReAct" döngüsü mimarisi. Çeşitli plugin ve CLI komutlarını kendi kendine çalıştırabilir.
- 🧠 **Sıfır Bulut Bağımlılığı (Yerel LLM):** Uygulama tamamen **Ollama** tarafından sunulan `llama3.1` (veya desteklenen diğer modeller) üzerinden çalışır. Veriniz dışarı çıkmaz.
- 🗄️ **Kurumsal RAG Veri Hattı (Data Pipeline):**
  - **MinIO:** Evrensel dosya alımı (PDF, TXT, CSV) ve obje depolama (Object Storage).
  - **Kafka Streams:** Dosyaların yüklenmesi ve asenkron veri akışının sağlanması.
  - **Qdrant:** Dinamik vektör veritabanı ile (KNN algoritması vs.) metinlerin parçalanıp (1500 chars, 200 overlap chunking strategy) anında yapay zekaya bağlam (context) olarak sunulması.
- 🎨 **Claude V3 Stili Premium Arayüz:** Next.js 15, Framer Motion, Tailwind CSS kullanılarak geliştirilmiş muazzam animasyonlu, akıcı bir arayüz.
- 💻 **Artifact Teknolojisi:** AI'nin yazdığı kodları bağımsız çalıştırılabilir gibi sağ panelde sunan gelişmiş "Code Artifact" paneli sistemi ve ajanın adım adım iş akışını gösteren "Agent Live Trace" izleme ekranı.

## 🛠️ Kullanılan Teknolojiler (Tech Stack)

* **Önyüz (Frontend):** Next.js (App Router), React 19, TailwindCSS, Framer Motion, Lucide React, React Markdown, React Syntax Highlighter.
* **Arkayüz (Backend) ve Veri (Data):** Node.js API Routes, KafkaJS (Streaming), MinIO (Blob Storage), Qdrant (Vector DB).
* **Yapay Zeka (AI Agent):** Ollama, OpenCode Eklenti Altyapısı (`@opencode-ai/plugin`).

## ⚙️ Kurulum ve Çalıştırma (Getting Started)

### Gereksinimler
- Node.js (v20+)
- Docker & Docker Compose (MinIO, Kafka ve Qdrant servisleri için)
- Ollama (ve sistemde yüklü `llama3.1` modeli -> `ollama run llama3.1`)

### 1. Projeyi Klonlayın ve Bağımlılıkları Yükleyin

```bash
# Proje ana dizinindeyken
npm install

# Client tarafındaki bağımlılıkları da yükleyin
cd client
npm install
```

### 2. Altyapıyı Çalıştırın (Kafka, MinIO, Qdrant)

Ana dizinde bulunan `docker-compose.yml` dosyası aracılığıyla veri hattını başlatın:
```bash
docker-compose up -d
```

### 3. Ajanı ve Arayüzü Başlatın

Eğer sadece CLI tabanlı Otonom Ajan testini yapmak isterseniz:
```bash
npm run start:agent
```

Next.js İstemcisini (Görsel Arayüz, Chatbot, Veri Yönetimi) başlatmak için ana dizinden:
```bash
npm run start:client
```
*(Uygulama `http://localhost:3000` adresinde yayına girecektir.)*

## 🏗️ Proje Yapısı

* `/client`: Next.js tabanlı ana web uygulaması. Chat, artifacts, pipeline arayüzlerini içerir.
  * `/client/src/app/page.tsx`: Uygulamanın merkezi UI orchestrator'ı (Claude-style arayüz).
* `/src/index.ts`: OpenCode Gitlawb sistem plugin entegrasyonu. Ajanın otonom çalıştırdığı terminal/git komutlarını barındırır.
* `agent_runner.ts`: Yapay zekanın "Tool Calling" ve "ReAct" döngülerini kurduğumuz asıl test script'i.
* `docker-compose.yml`: Bütün kurumsal veri omurga bileşenleri.

## 📄 Lisans

Bu proje MIT lisansı altında açık kaynaklıdır (Ayrıntılar için LICENSE dosyasına bakabilirsiniz).
