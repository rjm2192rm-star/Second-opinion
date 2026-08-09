# Second Opinion v2

GitHub must look like:

index.html
success.html
privacy.html
terms.html
package.json
vercel.json
api/
  analyze.js
  checkout.js
  unlock.js

Vercel environment variables required:

OPENAI_API_KEY = your OpenAI API secret key
STRIPE_SECRET_KEY = your Stripe secret key
SITE_URL = your production URL, e.g. https://second-opinion-xxxx.vercel.app

Stripe:
- Start in Test mode.
- Copy the Test secret key into STRIPE_SECRET_KEY.
- Redeploy.
- Run a scan, click Unlock, and use a Stripe test card.
- Only switch STRIPE_SECRET_KEY to a live key after you are ready to accept real money.

MVP notes:
- Full reports are encrypted before being stored in the customer's browser session.
- Paid unlock verifies the Stripe Checkout Session before decrypting.
- No report database is required.
- Because the report remains tied to the browser session, the user must complete checkout in the same browser.
- The scan cookie limits ordinary users to 5 scans/day, but this is not abuse-proof. Before meaningful traffic, add durable server-side rate limiting.
- Before public launch, replace placeholder business/contact language in Privacy and Terms and get appropriate legal review.
