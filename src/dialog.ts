export interface Choice<T extends string> {
  value: T
  label: string
  /** The option Enter picks; give it to the choice that loses nothing. */
  primary?: boolean
}

let open = false

/** True while a question is on screen, so other input can stand back. */
export function isAsking(): boolean {
  return open
}

/**
 * Ask the user to pick one of a few options in a modal dialog. Resolves to null when the dialog
 * is dismissed (Esc), or when another question is already being asked.
 */
export function choose<T extends string>(message: string, choices: Choice<T>[]): Promise<T | null> {
  if (open) return Promise.resolve(null)
  open = true

  const dialog = document.createElement('dialog')
  dialog.className = 'choice'
  const text = document.createElement('p')
  text.textContent = message
  const buttons = document.createElement('div')
  for (const choice of choices) {
    const button = document.createElement('button')
    button.textContent = choice.label
    button.classList.toggle('primary', choice.primary === true)
    button.autofocus = choice.primary === true
    button.addEventListener('click', () => dialog.close(choice.value))
    buttons.append(button)
  }
  dialog.append(text, buttons)
  document.body.append(dialog)

  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      open = false
      dialog.remove()
      resolve((dialog.returnValue as T) || null)
    })
    dialog.showModal()
  })
}
