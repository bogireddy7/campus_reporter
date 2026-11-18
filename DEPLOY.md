# Put Campus Reporter online (HTTPS)

An https address is needed so phones can use the **Tag my current location** button (browsers block GPS on plain http), and so students can reach the site from anywhere.

## Option A: Render (recommended)

1. Push this repo to GitHub (already done).
2. Go to https://render.com, sign up with GitHub, then **New + → Blueprint** and choose the `campus_reporter` repo. Render reads `render.yaml` and sets everything up.
3. Fill in the secret values it asks for:
   - `STAFF_CODE`: a code only the HOD and Admin Office know (they need it on the sign-up page)
   - `FAST2SMS_API_KEY`: your SMS key (see "SMS setup" below)
4. Click **Apply**. After a few minutes you get an address like `https://campus-reporter.onrender.com`.
5. Open `/admin/register` on that address: the HOD and the Admin Office person create their accounts with the staff code.

**Why a paid plan?** The database and photos are files. Render's free plan wipes files whenever the app restarts, so complaints would disappear. The `starter` plan with the 1 GB disk in `render.yaml` keeps them. (Free is fine for a quick demo only. Remove the `disk:` block and set `plan: free`.)

## SMS setup (Fast2SMS)

1. Sign up at https://www.fast2sms.com and verify your account.
2. Open the **Dev API** section and copy your API key. Put it in `FAST2SMS_API_KEY`.
3. Add some money to the wallet (each SMS is charged from it). New accounts may get a small free test credit, but check your dashboard.
4. In the dashboard, check the OTP route's price and that it is enabled for your account. If it is not, set `FAST2SMS_ROUTE=q` to use Quick SMS instead.
5. Do one test on the live site with your own number before announcing it to students.

Fast2SMS says its OTP and Quick SMS API routes work without your own DLT registration. If a message does not arrive, look at the site's logs: the exact reason from Fast2SMS is printed there (`OTP delivery failed: ...`).

Cost protection: the site sends at most `SMS_DAILY_LIMIT` SMS per day (default 300), 1 per 30 seconds and 5 per hour to the same number.

## Option B: Railway / any server with Node 22.13+

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Add a volume mounted at `/data` and set `DATA_DIR=/data`
- Set `NODE_ENV=production`, `JWT_SECRET` (long random text), `STAFF_CODE`, and `FAST2SMS_API_KEY`.

## Good to know

- With `NODE_ENV=production` the site refuses to start without `JWT_SECRET`, and it will **not** print OTP codes in the logs. If SMS is not set up, reporters see "SMS verification is not set up yet". (For a throwaway demo only, `ALLOW_CONSOLE_OTP=1` prints codes in the server log.)
- Back up the disk (database + `uploads/`) regularly.
- Map tiles come from OpenStreetMap, which is fine for a college-sized site.
