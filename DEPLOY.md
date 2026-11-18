# Put Campus Reporter online (HTTPS)

An https address is needed so phones can use the **Tag my current location** button (browsers block GPS on plain http), and so students can reach the site from anywhere.

## Option A: Render (recommended)

1. Push this repo to GitHub (already done).
2. Go to https://render.com, sign up with GitHub, then **New + → Blueprint** and choose the `campus_reporter` repo. Render reads `render.yaml` and sets everything up.
3. Fill in the secret values it asks for:
   - `STAFF_CODE`: a code only the HOD and Admin Office know (they need it on the sign-up page)
   - `SMTP_HOST` = `smtp.gmail.com`, `SMTP_USER` = your Gmail address, `SMTP_PASS` = a Gmail **App Password**, `SMTP_FROM` = `Campus Reporter <your@gmail.com>`
4. Click **Apply**. After a few minutes you get an address like `https://campus-reporter.onrender.com`.
5. Open `/admin/register` on that address: the HOD and the Admin Office person create their accounts with the staff code.

**Why a paid plan?** The database and photos are files. Render's free plan wipes files whenever the app restarts, so complaints would disappear. The `starter` plan with the 1 GB disk in `render.yaml` keeps them. (Free is fine for a quick demo only. Remove the `disk:` block and set `plan: free`.)

## Gmail App Password (for email codes)

1. Turn on 2-Step Verification for the Gmail account: https://myaccount.google.com/security
2. Open https://myaccount.google.com/apppasswords, create one named "Campus Reporter", and copy the 16-letter password.
3. Use it as `SMTP_PASS`.

## Option B: Railway / any server with Node 22.13+

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Add a volume mounted at `/data` and set `DATA_DIR=/data`
- Set `NODE_ENV=production`, `JWT_SECRET` (long random text), `STAFF_CODE`, and the `SMTP_*` values above.

## Good to know

- With `NODE_ENV=production` the site refuses to start without `JWT_SECRET`, and it will **not** print OTP codes in the logs. If email/SMS is not set up, reporters see "not set up yet". (For a throwaway demo only, `ALLOW_CONSOLE_OTP=1` prints codes in the server log.)
- Back up the disk (database + `uploads/`) regularly.
- Map tiles come from OpenStreetMap, which is fine for a college-sized site.
