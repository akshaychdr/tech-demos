import './styles/app.css'
import { mountApp } from './ui/app'

const el = document.querySelector<HTMLDivElement>('#app')
if (el) void mountApp(el)
