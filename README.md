# Gesundheits-Cockpit

Persönliches Cockpit für Gewohnheiten und Gesundheitswerte aus Apple Health
(Schritte, Schlaf, Blutdruck, Ruhepuls, Gewicht, Ernährung, Trainings).

- Reine Web-App ohne Build-Schritt: `index.html`, `styles.css`, `src/`.
- Die Werte kommen über einen iOS-Kurzbefehl, der sie hinter dem `#` der Adresse anhängt.
  Dieser Teil wird nie an einen Server geschickt. Gespeichert wird nur lokal im Browser (IndexedDB).
- Einrichtung und Automationen: [`docs/kurzbefehl-anleitung.html`](docs/kurzbefehl-anleitung.html).
- Beispieldaten ansehen: Adresse mit `#demo` öffnen.

Lokal starten:

```bash
python3 -m http.server 8000
```
