# Campus Reporter

A college community issue-reporting system. Anyone on campus can report a problem with a **photo, description, GPS tag and their details**. Complaints show up instantly on two staff dashboards: **HOD** and **Admin Office**, who update the status so the reporter can follow progress.

## Features

- **Simple reporting**: anyone on campus enters their name, roll no. / staff ID and mobile number, adds a photo and a description, and submits. No login and no codes. Logged-in HOD / Admin Office staff do not need to type their details
- **Report form**: camera/photo upload, category (choose **Other** and type your own name for the problem), urgency, description, "Tag my current location" (browser GPS) plus a typed place name
- **Tracking ID** (e.g. `CR-3M8H2F`) so reporters can check progress without an account (contact details are never shown on the public page)
- **Staff create their own accounts** (HOD, Admin Office) using a staff access code, then share one dashboard: stats, filters (status / category / priority / search), urgent issues sorted first, auto-refresh every 30 s
- **Map view**: the dashboard has a List / Map toggle that shows every geo-tagged complaint as a coloured pin (by priority) on **Google Maps**, with a **Navigate** button that opens Google Maps directions to the spot
- **Delete reports**: the HOD and Admin Office can delete a report (trash icon on the list, or inside the report). The photo and history are removed too
- **Issue detail**: full photo, description, reporter details, map link for the GPS tag, status + priority update with a note, full history
- Photo type/size validation (JPG/PNG/WebP, 6 MB), JWT login, hashed passwords, rate-limited login, sign-up and report submission

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

Settings go in a file called `.env` in the project folder, so you do not have to type them each time.

1. Copy the example: `copy .env.example .env` (Windows) or `cp .env.example .env` (Mac/Linux)
2. Open `.env` in Notepad / VS Code and fill in the values (see below).
3. Restart with `npm start`. The start-up messages tell you whether Google Maps is switched on.

`.env` is never uploaded to GitHub, so your keys stay private.

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

- Optional phone verification (OTP) to stop fake reports
- Email/SMS notification to the reporter when status changes
- Route categories automatically (e.g. academic → HOD, infrastructure → Office)
- Password reset / change screen
