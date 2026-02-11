import { render, screen } from '@testing-library/react'
import App from '../App'
import { vi } from 'vitest'
import axios from 'axios'

vi.mock('axios')

describe('App Component', () => {
  it('renders loading state initially', () => {
    axios.get.mockResolvedValue({ data: {} })
    render(<App />)
    expect(screen.getByText(/Loading OpenSoak.../i)).toBeInTheDocument()
  })
})
