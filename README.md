# Campus Reporter

A college community issue-reporting system. Anyone on campus can report a problem with a **photo, description, GPS tag and their details**. Complaints show up instantly on two staff dashboards: **HOD** and **Admin Office**, who update the status so the reporter can follow progress.

## Features

- **Verified reporting**: before reporting, a person enters their name, roll no. / staff ID and their mobile number, then confirms their number. This is free with a Telegram bot (the student taps "Share my phone number"), or with a 6-digit code sent by SMS or WhatsApp (paid). Only then can they submit a complaint
- **Report form**: camera/photo upload, category (choose **Other** and type your own name for the problem), urgency, description, "Tag my current location" (browser GPS) plus a typed place name
- **Tracking ID** (e.g. `CR-3M8H2F`) so reporters can check progress without an account (contact details are never shown on the public page)
- **Staff create their own accounts** (HOD, Admin Office) using a staff access code, then share one dashboard: stats, filters (status / category / priority / search), urgent issues sorted first, auto-refresh every 30 s
- **Map view**: the dashboard has a List / Map toggle that shows every geo-tagged complaint as a coloured pin (by priority) on **Google Maps**, with a **Navigate** button that opens Google Maps directions to the spot
- **Delete reports**: the HOD and Admin Office can delete a report (trash icon on the list, or inside the report). The photo and history are removed too
- **Staff skip verification**: when the HOD or Admin Office is logged in, they can report a problem directly without an OTP
- **Issue detail**: full photo, description, reporter details, map link for the GPS tag, status + priority update with a note, full history
- Photo type/size validation (JPG/PNG/WebP, 6 MB), JWT login, hashed passwords, rate-limited login/sign-up/OTP (codes are hashed, expire in 10 minutes, work once, lock after 5 wrong tries)

## Run it

Needs Node 22.13+.

```bash
npm run setup     # installs everything and builds the frontend
npm start         # http://localhost:3001
```

When the server starts it prints a **staff registration code**, for example:

```
Staff registration code: 9F3A1C7D  (give it only to the HOD and Admin Office)
```

The HOD and the Admin Office person each open **http://localhost:3001/admin/register**, choose their role, enter their name, email, a password and that code, and their account is created. After that they log in at `/admin/login`. There are no built-in default passwords.

- The code is generated once and saved in `data/staff-code.txt`. To choose your own, start with `STAFF_CODE=your-code npm start`.
- Share the code only with the HOD and Admin Office. Anyone who has it can create a staff account.
- Set a long random `JWT_SECRET` environment variable when you deploy for real.

## Settings (.env file)

**Easiest way for phone verification:** run `npm run configure`. It asks for your Telegram bot token (free), and optionally SMS / WhatsApp keys, saves it for you, and sends a test message to your phone.

Settings go in a file called `.env` in the project folder, so you do not have to type them each time.

1. Copy the example: `copy .env.example .env` (Windows) or `cp .env.example .env` (Mac/Linux)
2. Open `.env` in Notepad / VS Code and fill in the values (see below).
3. Restart with `npm start`. The start-up messages tell you whether SMS and Google Maps are switched on.

`.env` is never uploaded to GitHub, so your keys stay private.

### Free phone verification with Telegram (recommended)

No money, no SMS provider, unlimited students. The student opens a Telegram link, presses **Start**, and taps **Share my phone number**. Telegram itself confirms that number belongs to that account, and the website continues automatically.

1. In Telegram, chat with **@BotFather**, send `/newbot`, choose a name and a username ending in `bot`. Copy the token it gives you.
2. Run `npm run configure`, answer **Y** to Telegram and paste the token (or put `TELEGRAM_BOT_TOKEN=...` in `.env`).
3. `npm start`. You should see `Telegram verification: ON (free)`.

Good to know:
- Only Indian (+91) numbers are accepted, and the number must be the Telegram account's own (a forwarded contact is refused).
- The server asks Telegram for new messages continuously, so the site must be running all the time, and **only one copy** of the site may use a given bot token. Use a separate bot for testing on your own computer.
- Students need the Telegram app (free) on their phone.

### SMS one-time codes (optional, paid)

Reporters verify with their **mobile number** (Indian numbers). The 6-digit code is sent **to their phone by SMS or WhatsApp**. It is never shown on the screen or in the terminal, so until Telegram, SMS or WhatsApp is set up reporters cannot verify.

1. Create a [Fast2SMS](https://www.fast2sms.com) account, copy your API key from **Dev API**, and add some money to the wallet.
2. Put it in `.env`: `FAST2SMS_API_KEY=your-key`
3. Check it works: `npm run test:sms 9876543210` (use your own number). A test SMS should arrive.

Optional: `FAST2SMS_ROUTE=q` uses Fast2SMS "Quick SMS" instead of the default `otp` route (check which is enabled / cheaper in your dashboard). `SMS_DAILY_LIMIT=300` caps the SMS the whole site can send per day. Twilio also works (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`). Per-number limits: 1 code per 30 s and 5 per hour.

### WhatsApp one-time codes (optional)

If you fill in the WhatsApp settings, reporters can choose **SMS** or **WhatsApp** for their code (or only WhatsApp, if SMS is not set up). It uses Meta's official WhatsApp Business Cloud API. Meta's screens change, so follow their current guide if a step looks different.

1. Go to https://developers.facebook.com, create an app (type **Business**) and add the **WhatsApp** product.
2. Open **WhatsApp → API Setup**. It shows a free **test number**, its **Phone number ID** and a temporary **access token** (valid for about 24 hours). Add the phone numbers that may receive test messages (your own, friends') and confirm each with the code WhatsApp sends.
3. In **WhatsApp Manager → Message templates**, create a template with category **Authentication** (name e.g. `campus_otp`, with the "copy code" button) and wait until it is approved.
4. Put the values in `.env`: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE=campus_otp` and `WHATSAPP_TEMPLATE_LANG` (must match the template's language, e.g. `en_US`).
5. Check it: `npm run test:sms 9876543210 whatsapp` (use a number you added in step 2).

Good to know:
- The test number is free but can only message the numbers you registered. For real students you need your own WhatsApp Business number, a payment method on the Meta account, and a permanent token (create a **System User** token in Meta Business settings). Meta charges per authentication message. Check Meta's current pricing page.
- The temporary token stops working after about a day. If WhatsApp codes suddenly fail, make a new token.
- The daily limit (`SMS_DAILY_LIMIT`) counts SMS and WhatsApp messages together.

### Google Maps (dashboard map)

The Navigate buttons and "View on Google Maps" links work with no setup. The map with all the pins needs a Google Maps key:

1. Go to https://console.cloud.google.com, create a project and a billing account (Google gives a monthly free credit; a college-sized site normally stays within it).
2. Enable **Maps JavaScript API**, then **Credentials → Create credentials → API key**.
3. Restrict the key to your website address (HTTP referrers), then put it in `.env`: `GOOGLE_MAPS_API_KEY=your-key`

Without the key, the Map tab shows the located complaints as a list with Navigate buttons.

## Deploy online

See **[DEPLOY.md](DEPLOY.md)** for putting the site on the internet with HTTPS (Render blueprint included).

## Develop

```bash
npm run dev:server   # API on :3001
npm run dev:client   # Vite on :5173, proxies /api and /uploads
```

## Notes

- Data lives in `data/` (SQLite file + uploaded photos). Back it up.
- GPS tagging needs HTTPS (or localhost) in browsers. Deploy behind HTTPS for phones to use it.
- Layout: `server/` (Express + SQLite via Node's built-in `node:sqlite`), `client/` (React + Vite).

## Ideas for next steps

- Email/SMS notification to the reporter when status changes
- Route categories automatically (e.g. academic → HOD, infrastructure → Office)
- Password reset / change screen
