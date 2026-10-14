// Finnish UI strings: the source of truth for translation keys.
// Every visible UI string lives here. User text (Product, Location and One-off
// names) is never translated; interpolate it with {placeholders} instead.
export const fi = {
  "app.name": "Komero",
  "app.description": "Kodin varasto ja kauppalista",
  "common.loading": "Ladataan…",
  "common.undo": "Kumoa",

  "nav.koti": "Koti",
  "nav.scan": "Skannaa",
  "nav.lista": "Lista",
  "nav.settings": "Asetukset",
  "nav.back": "Takaisin",

  "auth.signInTitle": "Kirjaudu sisään",
  "auth.firstRunTitle": "Luo ensimmäinen tili",
  "auth.firstRunHint": "Komerossa ei ole vielä jäseniä. Luo ensimmäinen tili, niin pääset alkuun.",
  "auth.email": "Sähköposti",
  "auth.password": "Salasana",
  "auth.passwordHint": "Vähintään 8 merkkiä",
  "auth.signIn": "Kirjaudu",
  "auth.createAccount": "Luo tili",
  "auth.wrongCredentials": "Väärä sähköposti tai salasana.",
  "auth.inviteRequired": "Uusi jäsen tarvitsee kutsulinkin.",
  "auth.passwordTooShort": "Salasanassa on oltava vähintään 8 merkkiä.",
  "auth.genericError": "Jokin meni pieleen. Yritä uudelleen.",

  "koti.noProducts": "Ei tuotteita",
  "koti.search": "Hae tai lisää tuote",
  "koti.add": "+ Lisää ”{name}”",
  "koti.addTo": "Paikka",
  "koti.duplicate": "{name} on jo olemassa: {location}",
  "koti.use": "Käytä yksi: {name}",
  "koti.restock": "Lisää yksi: {name}",
  "koti.stockChanged": "{name}: {from} → {to}",
  "scan.comingSoon": "Skannaus tulossa pian.",
  "lista.comingSoon": "Ostoslista tulossa pian.",

  "settings.title": "Asetukset",
  "settings.signedInAs": "Kirjautunut: {email}",
  "settings.logOut": "Kirjaudu ulos",
} as const;

export type MessageKey = keyof typeof fi;
