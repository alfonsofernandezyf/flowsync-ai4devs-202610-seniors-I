import app from '@adonisjs/core/services/app'
import router from '@adonisjs/core/services/router'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * El contrato de la API, versionado en el repositorio.
 *
 * Hasta ahora el documento solo existía mientras el servidor corría: se
 * construía en cada petición y se servía por HTTP, y no había ningún fichero
 * que versionar. Este módulo es el que lo hace posible, y lo hace de una
 * manera sola: tanto el comando que genera el fichero como el que lo
 * comprueban construyen el documento **aquí**, con la misma función, para que
 * la comparación no pueda mentir por haber dos formas de generarlo.
 *
 * El documento se construye a partir del router y de los decoradores de los
 * controladores, igual que el que sirve `/api.json`. No hay ninguna ruta ni
 * ningún controlador que tocar: esto solo lee lo que ya está declarado.
 */

/**
 * La ruta del documento versionado, **relativa a la raíz del repositorio**.
 *
 * Es `docs/api/openapi.json` y vive fuera de `backend/` a propósito: es
 * documentación del proyecto entero, no un artefacto de la API, y por eso
 * comparte sitio con `docs/capabilities/` y `docs/adr/`.
 */
export const OPENAPI_DOCUMENT_FILE = 'docs/api/openapi.json'

/**
 * La raíz del repositorio.
 *
 * No se puede suponer que sea un nivel por encima de la aplicación: en un
 * build, la raíz de la aplicación es `backend/build/`, y subir un solo nivel
 * dejaría el documento en `backend/docs/`, en el sitio equivocado y sin
 * avisar. Así que se sube buscando el directorio que **es** la raíz del
 * repositorio: el que tiene a la vez `backend/` y `docs/`.
 */
function repositoryRoot(): string {
  let candidate = resolve(fileURLToPath(app.appRoot))

  for (;;) {
    if (existsSync(join(candidate, 'backend')) && existsSync(join(candidate, 'docs'))) {
      return candidate
    }

    const parent = dirname(candidate)
    if (parent === candidate) {
      // Se ha llegado al tope del sistema de ficheros sin encontrarlo. Se
      // devuelve la suposición de siempre, que al menos deja una ruta
      // creíble en el error.
      return resolve(fileURLToPath(app.appRoot), '..')
    }
    candidate = parent
  }
}

/**
 * La ruta **absoluta** del documento versionado.
 */
export function openapiDocumentPath(): string {
  return join(repositoryRoot(), OPENAPI_DOCUMENT_FILE)
}

/**
 * Construye el documento OpenAPI y lo devuelve ya serializado, listo para
 * escribir en un fichero.
 *
 * Se serializa **con sangrado de dos espacios y un salto de línea final**,
 * aunque el documento que sirve `/api.json` va minificado. No es un capricho:
 * el fichero versionado se lee y se revisa en un diff, y un JSON de una sola
 * línea no se puede revisar. El contenido es el mismo; solo cambia cómo se
 * presenta en el fichero.
 */
export async function renderOpenApiDocument(): Promise<string> {
  // El router no enseña sus rutas hasta que alguien lo **commitea**, y eso
  // solo lo hace el servidor HTTP al arrancar. Un comando no levanta ningún
  // servidor, así que sin este commit el documento saldría vacío: las rutas
  // estarían registradas pero sin pasar al almacén del que las lee el
  // generador. El commit es idempotente, así que no molesta si alguien ya lo
  // hizo.
  router.commit()

  const openapi = await app.container.make('openapi')
  const document = await openapi.buildDocument()

  return JSON.stringify(document, null, 2) + '\n'
}
