# Footballer Tic-Tac-Toe - Proje Dokümantasyonu

Bu belge, **Footballer Tic-Tac-Toe** projesinin mimarisini, dosya yapısını, önemli bileşenlerini ve oyun mantığını detaylı olarak açıklamaktadır. Proje, futbol bilgisine dayalı stratejik bir Tic-Tac-Toe oyunudur.

## 1. Genel Bakış (Overview)
Bu proje, gerçek zamanlı (real-time) çok oyunculu (multiplayer) bir web tabanlı oyundur.
- **Amaç**: 3x3'lük bir ızgarada (grid), satır ve sütundaki takımların her ikisinde de oynamış ortak bir futbolcuyu bularak hücreyi ele geçirmek.
- **Kazanma Şartı**: Tic-Tac-Toe kuralları geçerlidir (yatay, dikey veya çapraz 3'lü seri yapan kazanır).
- **Ekonomi**: Coin (Token) sistemi vardır. Maçlara giriş ücretlidir, kazanan ödülü alır.
- **Ligler**: Amateur, Pro ve Elite ligleri bulunur.

## 2. Teknoloji Yığını (Tech Stack)
*   **Frontend**: React (Next.js), TypeScript
*   **Backend**: Node.js (Custom Server), WebSocket (`ws` kütüphanesi)
*   **Veritabanı**: SQLite (`game.db` dosyası - kullanıcı verileri, coinler, istatistikler için)
*   **İletişim**: WebSocket üzerinden çift yönlü gerçek zamanlı iletişim.

## 3. Dosya Yapısı ve Önemli Dosyalar

### Ana Dosyalar
*   `server.js`: Uygulamanın kalbi.
    *   Hem Next.js sayfalarını sunar (HTTP) hem de WebSocket sunucusunu yönetir.
    *   Oyun mantığı (Game State), oda yönetimi (Room Management), kullanıcı bağlantıları burada tutulur.
    *   `valid_games.json` dosyasını yükleyerek her oyun için *garantili çözülebilir* haritalar oluşturur.
*   `db.js`: SQLite veritabanı işlemlerini (kullanıcı kaydı, giriş, coin güncelleme, liderlik tablosu) yönetir.
*   `generate_valid_games.js`: Bu script, `players.json` dosyasını analiz eder ve 9 hücrenin tamamının birbirinden farklı 9 oyuncu ile doldurulabileceği "mükemmel" 3x3 takım kombinasyonlarını hesaplar. Oyunun tıkanmamasını sağlar.
*   `players.json`: Futbolcu ve oynadıkları takımların verisini tutan ana veri dosyası.

### Arayüz (Frontend) - `components/`
*   `GameRoom.tsx`: Oyunun oynandığı ana ekran.
    *   WebSocket mesajlarını dinler (`gameStarted`, `makeMove`, `gameOver`).
    *   Oyun tahtasını (Grid) çizer.
    *   Oyuncu seçimi modalını yönetir.
    *   Kullanılan oyuncuları (Used Players) gösterir.
*   `LobbyView.tsx`: Giriş sonrası ana menü.
    *   Lig seçimi (`LeagueSelector`), özel oda kurma/katılma ve liderlik tablosunu içerir.
*   `AuthView.tsx`: Giriş ve Kayıt ekranı.
*   `LeagueSelector.tsx`: Lig kartlarını (Amateur/Pro/Elite) listeler.

### Sayfalar - `pages/`
*   `index.tsx`: Uygulamanın giriş noktası. WebSocket bağlantısını başlatır ve duruma göre (Auth, Lobby, Game) ilgili bileşeni ekrana getirir.

## 4. Oyun Mantığı ve Algoritmalar

### 4.1. Oyun Oluşturma (Valid Game Generation)
Oyunun en kritik kısmı, rastgele seçilen takımların kesişimlerinin boş kalmamasıdır.
1.  `generate_valid_games.js` scripti çalıştırılır.
2.  Bu script, `players.json` verisini tarayarak, 3x3'lük bir ızgarada **9 farklı hücre için 9 farklı oyuncu** bulunabilen kombinasyonları önceden hesaplar.
3.  Bulunan geçerli kombinasyonlar `data/valid_games.json` dosyasına kaydedilir.
4.  Sunucu başlatıldığında bu dosya yüklenir ve her yeni oyunda buradan rastgele bir harita seçilir (`Server: generateRandomTeams`).

### 4.2. Hamle Kontrolü
1.  Oyuncu bir hücreye tıklar.
2.  İstemci (Client), ilgili hücre için ortak oyuncuları listeler (`Client: getOptions`).
    *   *Yeni Özellik*: Eğer ortak oyuncu daha önce başka bir hücrede kullanıldıysa, listede "Kullanıldı / Used" olarak gösterilir ve seçilemez.
3.  Oyuncu bir futbolcu seçer (`Client: makeMove`).
4.  Sunucu, bu futbolcunun gerçekten her iki takımda oynayıp oynamadığını doğrular (`Server: isValidFootballerForTeams`).
5.  Doğruysa hamle işlenir, sıra diğer oyuncuya geçer.

### 4.3. Oyun Sonu (Game Over)
1.  **Kazanma**: Her hamleden sonra sunucu kazanma durumunu kontrol eder (`Server: checkWinner`). Bir oyuncu 3'lü seri yaparsa oyun biter.
    *   Kazanan: Giriş ücretinin 2 katını (ödül havuzu) kazanır (`Server: db.updateCoins`). Ekranda "You won" ve "+XX Coins" yazar.
    *   Kaybeden: Hiçbir şey kazanmaz. Ekranda "You lost" yazar.
    *   Liderlik tablosunda (Leaderboard) galibiyet sayısı güncellenir (`Server: db.updateStats`).
2.  **Beraberlik**: Tahta dolarsa ve kazanan yoksa berabere biter. Giriş ücretleri iade edilir.

## 5. Kurulum ve Çalıştırma (Installation)

Projeyi yerel ortamda çalıştırmak için:

1.  **Bağımlılıkları Yükleyin**:
    ```bash
    npm install
    ```

2.  **Harita Verisini Oluşturun (Opsiyonel ama Önerilen)**:
    Eğer `players.json` değişirse veya `valid_games.json` yoksa:
    ```bash
    node generate_valid_games.js
    ```

3.  **Projeyi Başlatın**:
    ```bash
    npm run dev
    ```
    Bu komut hem Next.js derlemesini yapar hem de `server.js`'i 3000 portunda başlatır.

4.  **Sorun Giderme**:
    Eğer "Port 3000 in use" hatası alırsanız:
    ```bash
    lsof -t -i:3000 | xargs kill -9
    ```

## 6. Veritabanı (Database)
SQLite veritabanı `game.db` dosyasında saklanır.
Tablo: `users`
- `id`: Benzersiz ID
- `username`: Kullanıcı adı
- `password`: Şifre (düz metin saklanıyor - geliştirmede hashlenmeli)
- `wins`: Galibiyet sayısı
- `losses`: Mağlubiyet sayısı
- `coins`: Mevcut para (Başlangıç: 100)

---
Bu proje, modern web teknolojileri ve sağlam bir backend mimarisi ile geliştirilmiş, genişletilebilir bir oyun altyapısı sunar.
