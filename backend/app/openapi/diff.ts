/**
 * Un diff de líneas, para explicar en qué se diferencian dos versiones del
 * documento OpenAPI.
 *
 * Se escribe a mano y no con una librería porque no hay ninguna instalada que
 * sirva: el diff tiene que ser pequeño, no tiene que ser una implementación
 * de `diff`, y solo necesita saber qué líneas se quitan y qué líneas se
 * añaden. El algoritmo es el clásico de la subsecuencia común más larga
 * (LCS).
 *
 * Dos decisiones que conviene tener presentes:
 *
 * - **Esto no decide si dos ficheros son iguales.** La comparación del
 *   contrato es byte a byte, en otro sitio. Aquí solo se cuenta qué líneas
 *   cambian y cómo se leen.
 * - **La matriz del LCS es cuadrada respecto de lo que se compara**, así que
 *   antes de llenarla se recortan el prefijo y el sufijo comunes. Sin eso, un
 *   documento de cinco mil líneas con un cambio en la mitad gastaría la
 *   memoria de una matriz de veinticinco millones de celdas en cada
 *   comparación. Con el recorte, solo se compara la zona que ha cambiado.
 */

type LineKind = ' ' | '-' | '+'

type DiffLine = {
  kind: LineKind
  text: string
  /** Número de línea en el fichero original, si la línea existe en él. */
  original?: number
  /** Número de línea en el fichero nuevo, si la línea existe en él. */
  generated?: number
}

/**
 * Compara dos ficheros línea a línea.
 *
 * Devuelve una línea por cada una de las dos versiones, marcada como igual
 * (` `), quitada (`-`) o añadida (`+`).
 */
export function diffLines(original: string[], generated: string[]): DiffLine[] {
  // El prefijo común: las primeras líneas que coinciden en los dos ficheros.
  let prefix = 0
  while (
    prefix < original.length &&
    prefix < generated.length &&
    original[prefix] === generated[prefix]
  ) {
    prefix++
  }

  // El sufijo común, sin pisar el prefijo.
  let originalEnd = original.length
  let generatedEnd = generated.length
  while (
    originalEnd > prefix &&
    generatedEnd > prefix &&
    original[originalEnd - 1] === generated[generatedEnd - 1]
  ) {
    originalEnd--
    generatedEnd--
  }

  const middleOriginal = original.slice(prefix, originalEnd)
  const middleGenerated = generated.slice(prefix, generatedEnd)

  const lines: DiffLine[] = []

  // El prefijo común, que se enseña como contexto y no como diferencia.
  for (let i = 0; i < prefix; i++) {
    lines.push({ kind: ' ', text: original[i], original: i + 1, generated: i + 1 })
  }

  lines.push(...diffMiddle(middleOriginal, middleGenerated, prefix))

  // Y el sufijo común. El texto es el mismo en los dos ficheros, pero los
  // números de línea no: el trozo central puede haber añadido o quitado
  // líneas, así que el desfase se lleva la cuenta.
  for (let i = originalEnd; i < original.length; i++) {
    lines.push({
      kind: ' ',
      text: original[i],
      original: i + 1,
      generated: generatedEnd + (i - originalEnd) + 1,
    })
  }

  return lines
}

/**
 * El diff del trozo que ha cambiado, con los números de línea ya puestos.
 *
 * `offset` es cuántas líneas del original hay antes del trozo: es lo que
 * permite numerar como corresponde.
 */
function diffMiddle(original: string[], generated: string[], offset: number): DiffLine[] {
  const originalLength = original.length
  const generatedLength = generated.length

  // `lengths[i][j]` es la longitud de la subsecuencia común más larga entre
  // `original[i..]` y `generated[j..]`. Se rellena de abajo arriba porque cada
  // celda depende de la de abajo y la de la derecha.
  const lengths: number[][] = Array.from({ length: originalLength + 1 }, () =>
    new Array<number>(generatedLength + 1).fill(0)
  )

  for (let i = originalLength - 1; i >= 0; i--) {
    for (let j = generatedLength - 1; j >= 0; j--) {
      lengths[i][j] =
        original[i] === generated[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }

  const lines: DiffLine[] = []
  let i = 0
  let j = 0

  while (i < originalLength && j < generatedLength) {
    if (original[i] === generated[j]) {
      lines.push({
        kind: ' ',
        text: original[i],
        original: offset + i + 1,
        generated: offset + j + 1,
      })
      i++
      j++
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      lines.push({ kind: '-', text: original[i], original: offset + i + 1 })
      i++
    } else {
      lines.push({ kind: '+', text: generated[j], generated: offset + j + 1 })
      j++
    }
  }

  while (i < originalLength) {
    lines.push({ kind: '-', text: original[i], original: offset + i + 1 })
    i++
  }

  while (j < generatedLength) {
    lines.push({ kind: '+', text: generated[j], generated: offset + j + 1 })
    j++
  }

  return lines
}

/**
 * Agrupa el diff en trozos y lo deja con el formato de un diff unificado:
 * cada trozo lleva su cabecera `@@` con las líneas que cubre.
 *
 * Solo se enseñan las líneas que cambian y tres líneas de contexto alrededor
 * de cada cambio: un documento entero en la salida no ayuda a nadie, y el
 * fichero de verdad lo tiene el diff de git.
 */
export function formatDiff(original: string[], generated: string[], context = 3): string[] {
  const lines = diffLines(original, generated)

  // Se marca qué líneas se enseñan: las que cambian, más el contexto.
  const shown = new Array<boolean>(lines.length).fill(false)
  lines.forEach((line, index) => {
    if (line.kind === ' ') {
      return
    }
    const from = Math.max(0, index - context)
    const to = Math.min(lines.length - 1, index + context)
    for (let k = from; k <= to; k++) {
      shown[k] = true
    }
  })

  // Cuántas líneas del original y del nuevo se han consumed antes de cada
  // línea: es lo que da las cabeceras `@@` del formato unificado.
  const consumedOriginal: number[] = []
  const consumedGenerated: number[] = []
  let originalCount = 0
  let generatedCount = 0
  for (const line of lines) {
    consumedOriginal.push(originalCount)
    consumedGenerated.push(generatedCount)
    if (line.kind !== '+') originalCount++
    if (line.kind !== '-') generatedCount++
  }

  const output: string[] = []
  let index = 0

  while (index < lines.length) {
    if (!shown[index]) {
      index++
      continue
    }

    // Se busca dónde acaba el trozo: la primera línea sin mostrar que rompe
    // la continuidad del contexto.
    let end = index
    while (end < lines.length && shown[end]) {
      end++
    }

    const chunk = lines.slice(index, end)

    output.push(
      `@@ -${consumedOriginal[index] + 1},${chunk.filter((line) => line.kind !== '+').length}` +
        ` +${consumedGenerated[index] + 1},${chunk.filter((line) => line.kind !== '-').length} @@`
    )
    for (const line of chunk) {
      output.push(`${line.kind}${line.text}`)
    }

    index = end
  }

  return output
}
