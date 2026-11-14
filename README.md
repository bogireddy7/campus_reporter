# Campus Reporter

A college community issue-reporting system. Anyone on campus can report a problem with a **photo, description, GPS tag and their details**. Complaints show up instantly on two staff dashboards: **HOD** and **Admin Office**, who update the status so the reporter can follow progress.

## Features

- **Public report form**: camera/photo upload, category, urgency, description, "Tag my current location" (browser GPS) plus a typed place name, reporter name / roll no. / contact
- **Tracking ID** (e.g. `CR-3M8H2F`) so reporters can check progress without an account (contact details are never shown on the public page)
- **Staff create their own accounts** (HOD, Admin Office) using a staff access code, then share one dashboard: stats, filters (status / category / priority / search), urgent issues sorted first, auto-refresh every 30 s
- **Issue detail**: full photo, description, reporter details, map link for the GPS tag, status + priority update with a note, full history
- Photo type/size validation (JPG/PNG/WebP, 6 MB), JWT login, hashed passwords, rate-limited login/sign-up

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
- Map view of all geo-tagged complaints
- Password reset / change screen
