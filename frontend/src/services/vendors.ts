import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { buildUrl, fetchJson } from './api'

export type Vendor = {
  id: number
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  category: string | null
  description: string | null
}

export type VendorPayload = {
  name: string
  contact_name?: string | null
  phone?: string | null
  email?: string | null
  category?: string | null
  description?: string | null
}

const VENDORS_KEY = ['vendors']

export function useVendors() {
  return useQuery<Vendor[]>({
    queryKey: VENDORS_KEY,
    queryFn: () => fetchJson<Vendor[]>(buildUrl('vendors', '/vendors')),
    staleTime: 30_000,
  })
}

export function useCreateVendor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: VendorPayload) =>
      fetchJson<Vendor>(buildUrl('vendors', '/vendors'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VENDORS_KEY }),
  })
}

export function useUpdateVendor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: VendorPayload }) =>
      fetchJson<Vendor>(buildUrl('vendors', `/vendors/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VENDORS_KEY }),
  })
}

export function useDeleteVendor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      fetchJson<{ deleted: boolean; id: number }>(buildUrl('vendors', `/vendors/${id}`), {
        method: 'DELETE',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VENDORS_KEY }),
  })
}
