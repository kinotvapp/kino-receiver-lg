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

Instalar y actualizar es lo mismo: el mismo comando reemplaza la versión anterior.

1. Descarga `kino-receptor-lg.ipk`.
2. Instala la herramienta de LG:
   ```
   npm i -g @webos-tools/cli
   ```
3. Registra la TV (una sola vez; cambia la IP por la de tu TV, la ves en Ajustes ▸ Red):
   ```
   ares-setup-device --add lg -i "host=IP_DE_LA_TV" -i "port=9922" -i "username=prisoner"
   ```
4. Trae la llave. Te pide la clave (*passphrase*) que muestra la app Developer Mode en la TV:
   ```
   ares-novacom --device lg --getkey
   ```
5. Instala:
   ```
   ares-install --device lg kino-receptor-lg.ipk
   ```
6. En el celular, en Kino, envía algo a la TV. **La primera vez la TV pregunta si permite el celular: acepta con el control remoto.**

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
