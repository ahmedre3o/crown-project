export interface User {
  id: number;
  username: string;
  role: 'admin' | 'employee' | 'customer';
  package: 'bronze' | 'silver' | 'gold';
}

export interface Part {
  id: number;
  name: string;
  brand: string;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
}

export interface Sale {
  id: number;
  partId: number;
  quantity: number;
  totalPrice: number;
  date: string;
}
