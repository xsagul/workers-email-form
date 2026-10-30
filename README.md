# workers-email-form

A contact form for a static site on **Cloudflare Workers**, with no database, no third-party form service and no CAPTCHA. Requests arrive as plain emails through **Cloudflare Email Routing**.

It's the pattern behind the quote form on [site-uri.ro](https://site-uri.ro), rewritten as a small standalone template.

## How it works

- The site is served as static assets. Only `POST /send` runs the Worker (`run_worker_first`), so every other request costs nothing.
- The Worker validates the JSON, caps every field's length, checks the `Origin` header and sends the message with the `send_email` binding. Nothing is stored.
- `Reply-To` is set to the visitor's email when they leave one, so answering is just pressing Reply.
- Two bot traps instead of a CAPTCHA:
  - a hidden `website` field that people never fill in;
  - a minimum of 3 seconds between opening the page and sending the form.

  Bots that fall into a trap get a normal `ok`, so they don't keep retrying.

## Setup

1. Enable **Email Routing** on your domain in Cloudflare and verify the destination address that should receive the requests.
2. Edit `wrangler.jsonc`:
   - `SENDER`: an address on your domain, for example `form@example.com`;
   - `RECIPIENT`: the verified destination address;
   - `SHOWN_TO` (optional): the address shown in the `To:` header, for example a public `contact@` alias.
3. Put your site in `public/` (the included `index.html` is a working example form).
4. Deploy:

```sh
npx wrangler deploy
```

For local testing, `npx wrangler dev` writes outgoing emails to `.wrangler/tmp` instead of sending them.

## Files

- `src/index.js`: the Worker (about 100 lines, no dependencies)
- `public/index.html`: an example form with the hidden field and the timer
- `wrangler.jsonc`: assets, the `/send` route and the email binding

## License

MIT. Made by [Sorin-Marian Știuriuc](https://github.com/xsagul) at [site-uri.ro](https://site-uri.ro).
