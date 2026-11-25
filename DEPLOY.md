# Put Campus Reporter online (HTTPS)

An https address is needed so phones can use the **Tag my current location** button (browsers block GPS on plain http), and so students can reach the site from anywhere.

## Option A: Render (recommended)

1. Push this repo to GitHub (already done).
2. Go to https://render.com, sign up with GitHub, then **New + → Blueprint** and choose the `campus_reporter` repo. Render reads `render.yaml` and sets everything up.
3. Fill in the secret values it asks for:
   - `STAFF_CODE`: a code only the HOD and Admin Office know (they need it on the sign-up page)
   - `GOOGLE_MAPS_API_KEY`: for the dashboard map (see the README)
4. Click **Apply**. After a few minutes you get an address like `https://campus-reporter.onrender.com`.
5. Open `/admin/register` on that address: the HOD and the Admin Office person create their accounts with the staff code.

**Why a paid plan?** The database and photos are files. Render's free plan wipes files whenever the app restarts, so complaints would disappear. The `starter` plan with the 1 GB disk in `render.yaml` keeps them. (Free is fine for a quick demo only. Remove the `disk:` block and set `plan: free`.)

## Option B: Railway / any server with Node 22.13+

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Add a volume mounted at `/data` and set `DATA_DIR=/data`
- Set `NODE_ENV=production`, `JWT_SECRET` (long random text), and `STAFF_CODE`.

## Good to know

- With `NODE_ENV=production` the site refuses to start without `JWT_SECRET`..
- Back up the disk (database + `uploads/`) regularly.
- The dashboard map uses Google Maps. Add `GOOGLE_MAPS_API_KEY` (see the README) and restrict the key to your live website address.
