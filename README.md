# Campus Reporter

A college community issue-reporting system. Anyone on campus can report a problem with a **photo, description, GPS tag and their details**. Complaints show up instantly on two staff dashboards: **HOD** and **Admin Office**, who update the status so the reporter can follow progress.

## Features

- **Verified reporting**: before reporting, a person enters their name, roll no. / staff ID and an email or mobile number, then confirms a 6-digit one-time code (OTP). Only then can they submit a complaint
- **Report form**: camera/photo upload, category (choose **Other** and type your own name for the problem), urgency, description, "Tag my current location" (browser GPS) plus a typed place name
- **Tracking ID** (e.g. `CR-3M8H2F`) so reporters can check progress without an account (contact details are never shown on the public page)
- **Staff create their own accounts** (HOD, Admin Office) using a staff access code, then share one dashboard: stats, filters (status / category / priority / search), urgent issues sorted first, auto-refresh every 30 s
- **Map view**: the dashboard has a List / Map toggle that shows every geo-tagged complaint as a coloured pin (by priority) on OpenStreetMap
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

## Sending the OTP (email / SMS)

Out of the box no email or SMS service is connected, so the code is **printed in the server terminal** (look for `[OTP] ... Code for ...`). That is fine for testing on your own computer. For real use, set one or both of these before `npm start`:

**Email (any SMTP, e.g. Gmail with an App Password):**
```bash
SMTP_HOST=smtp.gmail.com SMTP_PORT=587 SMTP_USER=you@gmail.com SMTP_PASS=your-app-password SMTP_FROM="Campus Reporter <you@gmail.com>"
```

**SMS (Twilio):**
```bash
TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM=+1xxxxxxxxxx
```
Note: sending SMS to Indian numbers usually needs the provider's DLT / sender registration, so email OTP is the easier option to start with.

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
