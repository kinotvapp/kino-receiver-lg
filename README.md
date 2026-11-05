# Kino Receptor para LG webOS

Receptor de Kino para TV LG con webOS. Permite que la app de Kino en el celular «envíe a la TV»: el celular abre este receptor en la
TV y la TV reproduce el video con su propio reproductor. No tiene servidor, ni plugins, ni credenciales.

**Descarga:** [`kino-receptor-lg.ipk`](https://github.com/kinotvapp/kino-receiver-lg/releases/latest/download/kino-receptor-lg.ipk)
(versión 1.0.0, también está en la raíz de este repositorio).

## Qué necesitas

- Una TV LG con **webOS 5 o superior** (probado en un OLED con webOS 6).
- La app **Developer Mode** de la LG Content Store y una cuenta de desarrollador LG (gratuita). Ábrela, inicia sesión y activa
  **Dev Mode Status** y **Key Server**. La TV se reinicia. La sesión caduca: prorrógala desde esa misma app.
- Una computadora en la misma red que la TV, con [Node.js](https://nodejs.org).
- **Kino 0.9.83 o posterior** en el celular, con el celular y la TV en la misma red Wi-Fi.

## Instalar (o actualizar)

Instalar y actualizar es lo mismo: reinstalar encima reemplaza la versión anterior. Antes, activa Developer Mode en la TV (ver arriba) y
descarga `kino-receptor-lg.ipk`. Elige una opción:

### Opción A: con interfaz gráfica (sin terminal)

Instala [Dev Manager Desktop](https://github.com/webosbrew/dev-manager-desktop) (app de la comunidad webosbrew), agrega tu TV con su
IP y la clave (*passphrase*) de la app Developer Mode, y arrastra [`kino-receptor-lg.ipk`](https://github.com/kinotvapp/kino-receiver-lg/releases/latest/download/kino-receptor-lg.ipk) a la pestaña de apps. *(No la hemos probado
nosotros; si falla, usa la opción B.)*

### Opción B: script (hace todo por ti)

Descarga este repositorio (botón **Code ▸ Download ZIP**), descomprímelo y ejecuta:

- **Windows:** doble clic en `instalar.bat`
- **Mac / Linux:** `./instalar.sh`

Te pide la IP de la TV (Ajustes ▸ Red) y la clave que muestra la app Developer Mode; instala la herramienta de LG si falta.

### Opción C: a mano

```
npm i -g @webos-tools/cli
ares-setup-device --add lg -i "host=IP_DE_LA_TV" -i "port=9922" -i "username=prisoner"
ares-novacom --device lg --getkey      # pide la clave de la app Developer Mode
ares-install --device lg kino-receptor-lg.ipk
```

### Después: cómo usarlo desde Kino

Con el receptor ya instalado, celular y TV en la misma red Wi-Fi y la TV encendida:

1. En Kino, abre un video y empieza a reproducirlo.
2. Toca el botón de **cast** y elige **Reproducir en TV (DLNA)**.
3. En la lista de dispositivos, elige la primera opción, **Kino Receptor · nombre de tu TV**.
4. **La primera vez la TV pregunta si permite el celular: acepta con el control remoto.**

La TV abre el receptor y reproduce el video. Si la TV no puede reproducirlo con el receptor, Kino lo reintenta solo por DLNA en la misma TV.

## Si algo falla

- **Kino dice «No instalado»:** el receptor no está en la TV, o Developer Mode caducó. Prorroga la sesión en la app Developer Mode y
  vuelve a instalar.
- **La TV abre el receptor pero no reproduce:** celular y TV deben estar en la misma red Wi-Fi; el celular le sirve el video a la TV por
  la red local.
- **Un video que la TV no puede reproducir:** Kino lo reintenta por DLNA en la misma TV, que convierte lo que la TV no decodifica.

## Compilar desde el código

```
./build.sh        # escribe dist/com.kino.receptor_<version>_all.ipk
```

Es una app web sencilla (`index.html`, `receiver.js`, `receiver.css`). La versión sale de `appinfo.json`.

`dev-driver.js` maneja el receptor sin el celular, para ajustar cómo se ve la pantalla de la TV (el modo de uso está en su
encabezado).

## Protocolo del canal de control (versión 1)

Celular a TV: `load {url, mime, startMs, title}`, `play`, `pause`, `seek {ms}`, `stop`.
TV a celular: `hello {v, ua}` primero, `status {ms, paused}` cada 2 s y al cambiar, `error {code, detail}` (code = `MediaError`;
4 = formato no soportado), `stopped {reason: back|ended}`, `log {m}`.

## Medido en una LG real (Chromium 79)

Reproduce HLS (segmentos fMP4 y TS) y MP4 progresivo H.264 de forma nativa. Un TS progresivo suelto falla y se manda como lista de
reproducción. Shaka 4.3.9 no funcionó, así que el receptor usa solo el reproductor nativo. Si se lanza con la app ya abierta, la página
no se recarga: dispara `webOSRelaunch` y el receptor se recarga para leer los parámetros nuevos.

Aún no incluye subtítulos ni elección de pista de audio.

## Licencia

GPL-3.0 (ver `LICENSE`). La tipografía Inter va bajo SIL OFL (`fonts/OFL.txt`).
