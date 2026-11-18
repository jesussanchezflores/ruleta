# Ruleta de Premios

Ruleta web para sorteos y eventos. Es un sitio estático (HTML + CSS + JS), sin build ni dependencias que instalar.

## Funciones

- **Premios** a mano (con cantidad), pegando una lista (un premio por línea) o importando **Excel / CSV**.
  - Columna A = premio, columna B = cantidad (opcional). La fila de encabezados se detecta sola.
  - Botón «Plantilla» para descargar un Excel de ejemplo.
- **Quitar premios al salir**: cada premio ganado se descuenta y pasa a la pestaña **Entregados**, desde donde se puede devolver a la ruleta o exportar a Excel.
- **Sonido** sintetizado (clics, giro, fanfarria) con interruptor y volumen.
- **Confeti** al ganar, luces animadas y modo presentación a pantalla completa.
- Todo se guarda en el navegador (`localStorage`).

Atajos: `Espacio` girar · `M` sonido · `F` presentación.

## Correr en local

```bash
npx serve .
# o
python3 -m http.server 8080
```

## Publicar en Vercel

```bash
npm i -g vercel
vercel        # vista previa
vercel --prod # producción
```

O sube la carpeta a un repositorio de GitHub e impórtalo en vercel.com (Framework Preset: **Other**, sin comando de build).
