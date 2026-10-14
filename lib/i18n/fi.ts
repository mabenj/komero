// Finnish UI strings: the source of truth for translation keys.
// Every visible UI string lives here. User text (Product, Location and One-off
// names) is never translated; interpolate it with {placeholders} instead.
// Every key also needs an English string in en.ts, or typecheck fails.
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

  "offline.banner": "Offline",
  "offline.pending": "muutokset lähetetään, kun yhteys palaa",

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
  "auth.accountExists": "Tällä sähköpostilla on jo tili. Kirjaudu sisään.",
  "auth.inviteTitle": "Liity Komeroon",
  "auth.inviteHint": "Sinut on kutsuttu. Valitse sähköposti ja salasana, niin pääset mukaan.",
  "auth.inviteUnusable": "Tämä kutsulinkki on jo käytetty tai vanhentunut. Pyydä uusi linkki.",
  "auth.goToSignIn": "Kirjaudu sisään",

  "koti.noProducts": "Ei tuotteita",
  "koti.search": "Hae tai lisää tuote",
  "koti.add": "+ Lisää ”{name}”",
  "koti.addTo": "Paikka",
  "koti.duplicate": "{name} on jo olemassa: {location}",
  "koti.use": "Käytä yksi: {name}",
  "koti.restock": "Lisää yksi: {name}",
  "koti.stockChanged": "{name}: {from} → {to}",
  "product.name": "Nimi",
  "product.homeLocation": "Paikka",
  "product.stock": "Kotona",
  "product.delete": "Poista tuote",
  "product.deleted": "{name} poistettu",
  "product.notFound": "Tuotetta ei löytynyt. Se on ehkä poistettu.",
  "scan.comingSoon": "Skannaus tulossa pian.",
  "lista.comingSoon": "Ostoslista tulossa pian.",

  "settings.title": "Asetukset",
  "settings.signedInAs": "Kirjautunut: {email}",
  "settings.logOut": "Kirjaudu ulos",
  "settings.language": "Kieli",
  // Language names are written in their own language in both dictionaries.
  "settings.language.fi": "Suomi",
  "settings.language.en": "English",
  "settings.members": "Jäsenet",
  "settings.you": "(sinä)",
  "settings.createInvite": "Luo kutsulinkki",
  "settings.inviteHint": "Linkillä voi liittyä kerran, ja se on voimassa 7 päivää.",
  "settings.inviteShareText": "Liity Komeroon:",
  "settings.share": "Jaa",
  "settings.copy": "Kopioi",
  "settings.copied": "Kopioitu!",
} as const;

export type MessageKey = keyof typeof fi;
