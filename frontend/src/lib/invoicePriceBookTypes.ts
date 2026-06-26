export type InvoicePriceBookItem = {
  id: number;
  item_name: string;
  unit_price: number;
  price: number;
  sell_unit_price: number;
};

export type InvoicePriceBookGroup = {
  price_book_id: number;
  price_book_name: string;
  source: 'customer' | 'company_default';
  items: InvoicePriceBookItem[];
};

export type InvoicePriceBookFlatItem = InvoicePriceBookItem & {
  price_book_id: number;
  price_book_name: string;
  source: 'customer' | 'company_default';
};

export type InvoicePriceBooksResponse = {
  customer_id: number;
  price_books: InvoicePriceBookGroup[];
  flat_items: InvoicePriceBookFlatItem[];
};

export type InvoiceLineItemDraft = {
  description: string;
  quantity: string;
  unit_price: string;
};

export function priceBookItemToLineItem(item: InvoicePriceBookItem | InvoicePriceBookFlatItem): InvoiceLineItemDraft {
  return {
    description: item.item_name,
    quantity: '1',
    unit_price: String(item.sell_unit_price ?? item.price ?? item.unit_price ?? 0),
  };
}
