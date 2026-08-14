// Shapes returned by the KitchenOwl API.
//
// The backend serves an OpenAPI document at /api/openapi, but it declares only
// two component schemas — the response bodies are described loosely or not at
// all. So these are written by hand against the Python models rather than
// generated, and a field being here is a claim that it was observed on the
// wire, not that the spec promises it.

export interface User {
  id: number;
  username: string;
  name: string;
  email?: string;
  admin?: boolean;
  photo?: string | null;
}

export interface Household {
  id: number;
  name: string;
  photo?: string | null;
  language?: string | null;
  member?: User[];
}

export interface Category {
  id: number;
  name: string;
}

export interface Item {
  id: number;
  name: string;
  icon?: string | null;
  category?: Category | null;
}

/** An item as it appears inside a recipe: the item, plus how much of it. */
export interface RecipeItem extends Item {
  description: string;
  optional: boolean;
}

/** An item on a shopping list: the item, plus how much you need. */
export interface ShoppinglistItem extends Item {
  description: string;
}

export interface Shoppinglist {
  id: number;
  name: string;
  items?: ShoppinglistItem[];
}

export interface Tag {
  id: number;
  name: string;
}

export interface Recipe {
  id: number;
  name: string;
  description: string;
  yields: number;
  time: number;
  cook_time: number;
  prep_time: number;
  photo?: string | null;
  source?: string;
  visibility?: string;
  items: RecipeItem[];
  tags: Tag[];
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}
