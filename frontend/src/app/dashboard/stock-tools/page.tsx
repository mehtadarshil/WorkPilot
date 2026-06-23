'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Package,
  Wrench,
  TrendingUp,
  Search,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  History,
  X,
  FileText,
  Upload,
  Calendar,
  User,
  MapPin,
  CheckCircle,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { getJson, postJson, patchJson, deleteRequest } from '../../apiClient';
import { AuthenticatedStockImage } from '@/components/AuthenticatedStockImage';

function imageUploadFields(dataUrl: string, originalFilename: string, contentType: string) {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (m) {
    return {
      image_base64: m[2],
      original_filename: originalFilename,
      content_type: m[1],
    };
  }
  return {
    image_base64: dataUrl,
    original_filename: originalFilename,
    content_type: contentType,
  };
}

// --- Types ---
interface StockItem {
  id: number;
  name: string;
  mpn: string | null;
  quantity: number;
  category: string;
  quality: string;
  location: string;
  image_url: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

interface StockTransaction {
  id: number;
  stock_item_id: number;
  part_id: number | null;
  job_id: number | null;
  quantity: number;
  transaction_type: 'consume' | 'reverse' | 'audit_adjust' | 'restock';
  notes: string | null;
  created_by: number;
  created_at: string;
  item_name: string;
  item_mpn: string | null;
  user_name: string;
  job_number: string | null;
}

interface Tool {
  id: number;
  name: string;
  category: string;
  status: 'available' | 'in_use' | 'missing' | 'damaged';
  location: string;
  assigned_officer_id: number | null;
  image_url: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
  assigned_officer_name?: string | null;
}

interface Officer {
  id: number;
  full_name: string;
  role_position: string | null;
  state: string;
}

interface Analytics {
  stockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  toolsCount: number;
  toolsByStatus: {
    available: number;
    in_use: number;
    missing: number;
    damaged: number;
  };
  categoryStats: {
    category: string;
    total_used: number;
    current_stock: number;
  }[];
}

const STOCK_CATEGORIES = ['Electrical', 'Locksmith', 'Plumbing', 'HVAC', 'General'];
const TOOL_CATEGORIES = ['Power Tools', 'Hand Tools', 'Measurement', 'Safety', 'Other'];
const DEFAULT_LOCATIONS = ['Van', 'House', 'Store', 'Other'];
const QUALITIES = ['New', 'Used - Good', 'Used - Fair', 'Damaged'];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function StockToolsPage() {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [activeToken, setActiveToken] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setActiveToken(window.localStorage.getItem('wp_token'));
    }
  }, []);

  // Tabs
  const [activeTab, setActiveTab] = useState<'stock' | 'tools' | 'analytics'>('stock');

  // --- Common States ---
  const [officers, setOfficers] = useState<Officer[]>([]);

  // --- Stock States ---
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [stockSearch, setStockSearch] = useState('');
  const [stockCategoryFilter, setStockCategoryFilter] = useState('All');
  const [stockLocationFilter, setStockLocationFilter] = useState('All');
  const [loadingStock, setLoadingStock] = useState(true);

  // --- Tools States ---
  const [tools, setTools] = useState<Tool[]>([]);
  const [toolsSearch, setToolsSearch] = useState('');
  const [toolsCategoryFilter, setToolsCategoryFilter] = useState('All');
  const [toolsStatusFilter, setToolsStatusFilter] = useState('All');
  const [loadingTools, setLoadingTools] = useState(true);

  // --- Analytics States ---
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);

  // --- Modal States ---
  const [showStockModal, setShowStockModal] = useState(false);
  const [editingStockItem, setEditingStockItem] = useState<StockItem | null>(null);
  const [stockForm, setStockForm] = useState({
    name: '',
    mpn: '',
    quantity: '0',
    category: 'Electrical',
    quality: 'New',
    location: 'Store',
    image_base64: '',
    original_filename: '',
    content_type: '',
  });

  const [showToolModal, setShowToolModal] = useState(false);
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [toolForm, setToolForm] = useState({
    name: '',
    category: 'Power Tools',
    status: 'available' as 'available' | 'in_use' | 'missing' | 'damaged',
    location: 'Store',
    assigned_officer_id: '',
    image_base64: '',
    original_filename: '',
    content_type: '',
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [locations, setLocations] = useState<string[]>(DEFAULT_LOCATIONS);
  const [showLocationSettings, setShowLocationSettings] = useState(false);
  const [locationDraft, setLocationDraft] = useState('');
  const [savingLocations, setSavingLocations] = useState(false);

  const fetchLocationOptions = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ location_options: string[] }>('/settings/stock-tools', token);
      const opts = data.location_options?.filter((v) => v.trim().length > 0) ?? [];
      if (opts.length > 0) setLocations(opts);
    } catch {
      setLocations(DEFAULT_LOCATIONS);
    }
  }, [token]);

  const saveLocationOptions = async () => {
    if (!token) return;
    setSavingLocations(true);
    setErrorMsg(null);
    try {
      const location_options = locationDraft
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (location_options.length === 0) {
        setErrorMsg('Add at least one location.');
        return;
      }
      const res = await patchJson<{ location_options: string[] }>(
        '/settings/stock-tools',
        { location_options },
        token,
      );
      setLocations(res.location_options);
      setShowLocationSettings(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save locations');
    } finally {
      setSavingLocations(false);
    }
  };

  const fetchOfficers = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ officers: Officer[] }>('/officers/list', token);
      setOfficers(data?.officers || []);
    } catch (err) {
      console.error('Error fetching officers:', err);
    }
  }, [token]);

  const fetchStock = useCallback(async () => {
    if (!token) return;
    setLoadingStock(true);
    try {
      const data = await getJson<StockItem[]>('/stock', token);
      setStockItems(data || []);
      const txData = await getJson<StockTransaction[]>('/stock/transactions', token);
      setTransactions(txData || []);
    } catch (err) {
      console.error('Error fetching stock:', err);
    } finally {
      setLoadingStock(false);
    }
  }, [token]);

  const fetchTools = useCallback(async () => {
    if (!token) return;
    setLoadingTools(true);
    try {
      const data = await getJson<Tool[]>('/tools', token);
      setTools(data || []);
    } catch (err) {
      console.error('Error fetching tools:', err);
    } finally {
      setLoadingTools(false);
    }
  }, [token]);

  const fetchAnalytics = useCallback(async () => {
    if (!token) return;
    setLoadingAnalytics(true);
    try {
      const data = await getJson<Analytics>('/stock-tools/analytics', token);
      setAnalytics(data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setLoadingAnalytics(false);
    }
  }, [token]);

  useEffect(() => {
    fetchOfficers();
    void fetchLocationOptions();
  }, [fetchOfficers, fetchLocationOptions]);

  useEffect(() => {
    if (activeTab === 'stock') {
      fetchStock();
    } else if (activeTab === 'tools') {
      fetchTools();
    } else if (activeTab === 'analytics') {
      fetchAnalytics();
    }
  }, [activeTab, fetchStock, fetchTools, fetchAnalytics]);

  // --- Stock Actions ---
  const handleOpenAddStock = () => {
    setEditingStockItem(null);
    setStockForm({
      name: '',
      mpn: '',
      quantity: '0',
      category: 'Electrical',
      quality: 'New',
      location: 'Store',
      image_base64: '',
      original_filename: '',
      content_type: '',
    });
    setErrorMsg(null);
    setShowStockModal(true);
  };

  const handleOpenEditStock = (item: StockItem) => {
    setEditingStockItem(item);
    setStockForm({
      name: item.name,
      mpn: item.mpn || '',
      quantity: String(item.quantity),
      category: item.category,
      quality: item.quality,
      location: item.location,
      image_base64: '',
      original_filename: '',
      content_type: '',
    });
    setErrorMsg(null);
    setShowStockModal(true);
  };

  const handleStockFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await fileToDataUrl(file);
      setStockForm((prev) => ({
        ...prev,
        image_base64: base64,
        original_filename: file.name,
        content_type: file.type,
      }));
    } catch (err) {
      console.error('File load error:', err);
    }
  };

  const handleSaveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setErrorMsg(null);

    const payload = {
      name: stockForm.name.trim(),
      mpn: stockForm.mpn.trim() || null,
      quantity: parseInt(stockForm.quantity, 10),
      category: stockForm.category,
      quality: stockForm.quality,
      location: stockForm.location,
      ...(stockForm.image_base64
        ? imageUploadFields(
            stockForm.image_base64,
            stockForm.original_filename,
            stockForm.content_type,
          )
        : {}),
    };

    if (!payload.name) {
      setErrorMsg('Name is required');
      return;
    }
    if (isNaN(payload.quantity) || payload.quantity < 0) {
      setErrorMsg('Quantity must be 0 or greater');
      return;
    }

    try {
      if (editingStockItem) {
        await patchJson(`/stock/${editingStockItem.id}`, payload, token);
      } else {
        await postJson('/stock', payload, token);
      }
      setShowStockModal(false);
      fetchStock();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving stock item');
    }
  };

  const handleDeleteStock = async (itemId: number) => {
    if (!token) return;
    if (!confirm('Are you sure you want to delete this stock item? This will also remove its history logs.')) return;
    try {
      await deleteRequest(`/stock/${itemId}`, token);
      fetchStock();
    } catch (err: any) {
      alert(err.message || 'Error deleting stock item');
    }
  };

  // --- Tool Actions ---
  const handleOpenAddTool = () => {
    setEditingTool(null);
    setToolForm({
      name: '',
      category: 'Power Tools',
      status: 'available',
      location: 'Store',
      assigned_officer_id: '',
      image_base64: '',
      original_filename: '',
      content_type: '',
    });
    setErrorMsg(null);
    setShowToolModal(true);
  };

  const handleOpenEditTool = (tool: Tool) => {
    setEditingTool(tool);
    setToolForm({
      name: tool.name,
      category: tool.category,
      status: tool.status,
      location: tool.location,
      assigned_officer_id: tool.assigned_officer_id ? String(tool.assigned_officer_id) : '',
      image_base64: '',
      original_filename: '',
      content_type: '',
    });
    setErrorMsg(null);
    setShowToolModal(true);
  };

  const handleToolFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await fileToDataUrl(file);
      setToolForm((prev) => ({
        ...prev,
        image_base64: base64,
        original_filename: file.name,
        content_type: file.type,
      }));
    } catch (err) {
      console.error('File load error:', err);
    }
  };

  const handleSaveTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setErrorMsg(null);

    const payload = {
      name: toolForm.name.trim(),
      category: toolForm.category,
      status: toolForm.status,
      location: toolForm.location,
      assigned_officer_id: toolForm.assigned_officer_id ? parseInt(toolForm.assigned_officer_id, 10) : null,
      ...(toolForm.image_base64
        ? imageUploadFields(toolForm.image_base64, toolForm.original_filename, toolForm.content_type)
        : {}),
    };

    if (!payload.name) {
      setErrorMsg('Name is required');
      return;
    }

    try {
      if (editingTool) {
        await patchJson(`/tools/${editingTool.id}`, payload, token);
      } else {
        await postJson('/tools', payload, token);
      }
      setShowToolModal(false);
      fetchTools();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving tool');
    }
  };

  const handleDeleteTool = async (toolId: number) => {
    if (!token) return;
    if (!confirm('Are you sure you want to delete this tool?')) return;
    try {
      await deleteRequest(`/tools/${toolId}`, token);
      fetchTools();
    } catch (err: any) {
      alert(err.message || 'Error deleting tool');
    }
  };

  // --- Filtering Logic ---
  const filteredStock = stockItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(stockSearch.toLowerCase()) ||
      (item.mpn || '').toLowerCase().includes(stockSearch.toLowerCase()) ||
      item.location.toLowerCase().includes(stockSearch.toLowerCase());
    const matchesCategory = stockCategoryFilter === 'All' || item.category === stockCategoryFilter;
    const matchesLocation = stockLocationFilter === 'All' || item.location === stockLocationFilter;
    return matchesSearch && matchesCategory && matchesLocation;
  });

  const filteredTools = tools.filter((tool) => {
    const matchesSearch =
      tool.name.toLowerCase().includes(toolsSearch.toLowerCase()) ||
      tool.location.toLowerCase().includes(toolsSearch.toLowerCase()) ||
      (tool.assigned_officer_name || '').toLowerCase().includes(toolsSearch.toLowerCase());
    const matchesCategory = toolsCategoryFilter === 'All' || tool.category === toolsCategoryFilter;
    const matchesStatus = toolsStatusFilter === 'All' || tool.status === toolsStatusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div className="flex flex-col gap-6 p-6 min-h-screen bg-slate-50">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Stock & Tools Manager</h1>
          <p className="text-sm text-slate-500">Track parts inventory, manage company tools, link to jobs, and track usage analytics.</p>
        </div>

        {/* Tab Selection */}
        <div className="flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200 w-fit">
          <button
            onClick={() => setActiveTab('stock')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'stock'
                ? 'bg-[#14B8A6] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Package className="size-4" />
            Stock Inventory
          </button>
          <button
            onClick={() => setActiveTab('tools')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'tools'
                ? 'bg-[#14B8A6] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Wrench className="size-4" />
            Tools Registry
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'analytics'
                ? 'bg-[#14B8A6] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <TrendingUp className="size-4" />
            Usage Analytics
          </button>
        </div>
      </div>

      {/* ─── TAB CONTENT: STOCK ─── */}
      {activeTab === 'stock' && (
        <div className="flex flex-col gap-6">
          {/* Controls */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by part name, MPN, location..."
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 pl-10 pr-4 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]"
                />
              </div>

              <select
                value={stockCategoryFilter}
                onChange={(e) => setStockCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
              >
                <option value="All">All Categories</option>
                {STOCK_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <select
                value={stockLocationFilter}
                onChange={(e) => setStockLocationFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
              >
                <option value="All">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setLocationDraft(locations.join('\n'));
                  setShowLocationSettings(true);
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Manage locations
              </button>
              <button
                onClick={handleOpenAddStock}
                className="flex items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] shadow-sm transition animate-press"
              >
                <Plus className="size-4" /> Add Part to Stock
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Grid of Parts */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              {loadingStock ? (
                <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-slate-400">
                  Loading stock catalog...
                </div>
              ) : filteredStock.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-slate-400 gap-2">
                  <Package className="size-8 text-slate-300" />
                  <p className="text-sm font-medium">No stock items match your criteria.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredStock.map((item) => {
                    const isLow = item.quantity > 0 && item.quantity <= 5;
                    const isOut = item.quantity === 0;

                    return (
                      <div
                        key={item.id}
                        className="group relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-[#14B8A6]/40 transition"
                      >
                        <div>
                          {/* Image preview & Header */}
                          <div className="flex gap-4 mb-3">
                            <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                              {item.image_url && activeToken ? (
                                <AuthenticatedStockImage
                                  imageUrl={item.image_url}
                                  category="stock-photos"
                                  token={activeToken}
                                  alt={item.name}
                                  className="size-full object-cover"
                                  fallback={
                                    <div className="flex size-full items-center justify-center text-slate-300">
                                      <Package className="size-6" />
                                    </div>
                                  }
                                />
                              ) : (
                                <div className="flex size-full items-center justify-center text-slate-300">
                                  <Package className="size-6" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                {item.category}
                              </span>
                              <h3 className="font-bold text-slate-900 truncate mt-1">{item.name}</h3>
                              <p className="text-xs text-slate-500 truncate">MPN: {item.mpn || 'N/A'}</p>
                            </div>
                          </div>

                          {/* Stats Info */}
                          <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-xs border border-slate-100">
                            <div>
                              <p className="text-slate-400 font-semibold mb-0.5">Location</p>
                              <p className="font-bold text-slate-700 truncate">{item.location}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-semibold mb-0.5">Quality</p>
                              <p className="font-bold text-slate-700 truncate">{item.quality}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-semibold mb-0.5">Stock Level</p>
                              <p className={`font-bold ${isOut ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-[#14B8A6]'}`}>
                                {item.quantity} units
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Badges / Alerts & Actions */}
                        <div className="flex items-center justify-between border-t border-slate-100 mt-4 pt-3">
                          <div>
                            {isOut && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 border border-rose-100">
                                <AlertTriangle className="size-3" /> Out of Stock
                              </span>
                            )}
                            {isLow && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-100">
                                <AlertTriangle className="size-3" /> Low Stock
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                            <button
                              onClick={() => handleOpenEditStock(item)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                              title="Edit Part"
                            >
                              <Edit2 className="size-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteStock(item.id)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                              title="Delete Part"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sidebar: Transaction History Log */}
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <History className="size-5 text-[#14B8A6]" />
                <div>
                  <h3 className="font-bold text-slate-900">Inventory Logs</h3>
                  <p className="text-xs text-slate-500">Real-time usage and restocking tracking.</p>
                </div>
              </div>

              <div className="flex flex-col gap-4 overflow-y-auto max-h-[500px] pr-1">
                {loadingStock ? (
                  <div className="text-center py-6 text-slate-400 text-sm">Loading logs...</div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm">No transaction logs available.</div>
                ) : (
                  transactions.slice(0, 50).map((tx) => {
                    const isConsumption = tx.transaction_type === 'consume';
                    const isReverse = tx.transaction_type === 'reverse';
                    const isRestock = tx.transaction_type === 'restock';

                    let typeLabel = 'Adjustment';
                    let typeClass = 'bg-slate-100 text-slate-700';
                    let qPrefix = '';
                    if (isConsumption) {
                      typeLabel = 'Consumed';
                      typeClass = 'bg-rose-50 text-rose-700 border border-rose-100';
                      qPrefix = '-';
                    } else if (isReverse) {
                      typeLabel = 'Returned';
                      typeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-100';
                      qPrefix = '+';
                    } else if (isRestock) {
                      typeLabel = 'Restocked';
                      typeClass = 'bg-blue-50 text-blue-700 border border-blue-100';
                      qPrefix = '+';
                    }

                    return (
                      <div key={tx.id} className="text-xs border-b border-slate-50 pb-3 last:border-b-0 last:pb-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-bold text-slate-800 break-words flex-1">
                            {tx.item_name}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${typeClass}`}>
                            {qPrefix}
                            {tx.quantity} units
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-slate-400">
                          <span>{typeLabel}</span>
                          <span>•</span>
                          <span>{tx.user_name}</span>
                          <span>•</span>
                          <span>{new Date(tx.created_at).toLocaleDateString()}</span>
                        </div>
                        {tx.job_number && (
                          <div className="mt-1 flex items-center gap-1 text-slate-500 font-medium">
                            <FileText className="size-3" />
                            Job #{tx.job_number}
                          </div>
                        )}
                        {tx.notes && <p className="mt-1 italic text-slate-500">{tx.notes}</p>}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB CONTENT: TOOLS ─── */}
      {activeTab === 'tools' && (
        <div className="flex flex-col gap-6">
          {/* Controls */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search tools, custodian, location..."
                  value={toolsSearch}
                  onChange={(e) => setToolsSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 pl-10 pr-4 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]"
                />
              </div>

              <select
                value={toolsCategoryFilter}
                onChange={(e) => setToolsCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
              >
                <option value="All">All Categories</option>
                {TOOL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <select
                value={toolsStatusFilter}
                onChange={(e) => setToolsStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
              >
                <option value="All">All Statuses</option>
                <option value="available">Available</option>
                <option value="in_use">In Use</option>
                <option value="damaged">Damaged</option>
                <option value="missing">Missing</option>
              </select>
            </div>

            <button
              onClick={handleOpenAddTool}
              className="flex items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] shadow-sm transition animate-press"
            >
              <Plus className="size-4" /> Add Tool to Registry
            </button>
          </div>

          {/* Grid of Tools */}
          {loadingTools ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-slate-400">
              Loading tools registry...
            </div>
          ) : filteredTools.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-slate-400 gap-2">
              <Wrench className="size-8 text-slate-300" />
              <p className="text-sm font-medium">No tools match your filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {filteredTools.map((tool) => {
                let statusClass = 'bg-slate-100 text-slate-700';
                let statusLabel = 'Available';
                if (tool.status === 'in_use') {
                  statusClass = 'bg-blue-100 text-blue-800';
                  statusLabel = 'In Use';
                } else if (tool.status === 'damaged') {
                  statusClass = 'bg-amber-100 text-amber-800';
                  statusLabel = 'Damaged';
                } else if (tool.status === 'missing') {
                  statusClass = 'bg-rose-100 text-rose-800';
                  statusLabel = 'Missing';
                } else if (tool.status === 'available') {
                  statusClass = 'bg-emerald-100 text-emerald-800';
                  statusLabel = 'Available';
                }

                return (
                  <div
                    key={tool.id}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-[#14B8A6]/40 transition"
                  >
                    {/* Tool Image Preview Header */}
                    <div className="relative aspect-video w-full bg-slate-50 border-b border-slate-100 flex items-center justify-center">
                      {tool.image_url && activeToken ? (
                        <AuthenticatedStockImage
                          imageUrl={tool.image_url}
                          category="tool-photos"
                          token={activeToken}
                          alt={tool.name}
                          className="size-full object-cover"
                          fallback={
                            <div className="flex size-full items-center justify-center text-slate-300">
                              <Wrench className="size-8" />
                            </div>
                          }
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-slate-300">
                          <Wrench className="size-8" />
                        </div>
                      )}
                      <span className={`absolute right-3 top-3 px-2 py-0.5 rounded-full text-xs font-bold shadow-sm ${statusClass}`}>
                        {statusLabel}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 mb-1">
                          {tool.category}
                        </span>
                        <h3 className="font-bold text-slate-900 truncate mb-2">{tool.name}</h3>

                        <div className="flex flex-col gap-1.5 text-xs text-slate-600 mt-2">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="size-3.5 text-slate-400" />
                            <span>Location: <strong>{tool.location}</strong></span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <User className="size-3.5 text-slate-400" />
                            <span>Custodian: <strong>{tool.assigned_officer_name || 'None Assigned'}</strong></span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-end border-t border-slate-100 mt-4 pt-3 opacity-80 group-hover:opacity-100 transition gap-1">
                        <button
                          onClick={() => handleOpenEditTool(tool)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                          title="Edit Tool"
                        >
                          <Edit2 className="size-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTool(tool.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          title="Delete Tool"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB CONTENT: ANALYTICS ─── */}
      {activeTab === 'analytics' && (
        <div className="flex flex-col gap-6">
          {loadingAnalytics || !analytics ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-slate-400">
              Loading usage analytics...
            </div>
          ) : (
            <>
              {/* Stat Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
                  <div className="rounded-xl bg-[#14B8A6]/10 p-3 text-[#14B8A6]">
                    <Package className="size-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Stock Items</p>
                    <p className="text-2xl font-black text-slate-900">{analytics.stockCount}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
                  <div className="rounded-xl bg-amber-50 p-3 text-amber-600 border border-amber-100">
                    <AlertTriangle className="size-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Low Stock warnings</p>
                    <p className="text-2xl font-black text-slate-900">{analytics.lowStockCount}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
                  <div className="rounded-xl bg-rose-50 p-3 text-rose-600 border border-rose-100">
                    <AlertTriangle className="size-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Out of Stock items</p>
                    <p className="text-2xl font-black text-slate-900">{analytics.outOfStockCount}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
                  <div className="rounded-xl bg-blue-50 p-3 text-blue-600 border border-blue-100">
                    <Wrench className="size-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Registered Tools</p>
                    <p className="text-2xl font-black text-slate-900">{analytics.toolsCount}</p>
                  </div>
                </div>
              </div>

              {/* Analytics Dashboard Visualizations */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* SVG usage chart */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Category Usage Rates vs Current Stock</h3>
                    <p className="text-xs text-slate-400 mb-6">Compares overall quantities used on jobs versus quantities currently available.</p>
                  </div>

                  <div className="relative w-full h-72 flex flex-col justify-between border-l border-b border-slate-200 pl-4 pb-2">
                    {analytics.categoryStats.length === 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs">
                        No usage data available to graph.
                      </div>
                    ) : (
                      analytics.categoryStats.map((stat, i) => {
                        const maxVal = Math.max(...analytics.categoryStats.map(s => Math.max(s.total_used, s.current_stock, 1)));
                        const usedPct = (stat.total_used / maxVal) * 100;
                        const stockPct = (stat.current_stock / maxVal) * 100;

                        return (
                          <div key={i} className="flex flex-col gap-1 w-full my-1">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                              <span>{stat.category}</span>
                              <span className="text-slate-400 font-semibold">
                                Used: {stat.total_used} | Stock: {stat.current_stock}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1 w-full bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                              {/* Used bar */}
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-2 rounded bg-rose-400 transition-all duration-500"
                                  style={{ width: `${Math.max(usedPct, 2)}%` }}
                                />
                                <span className="text-[10px] text-slate-400">Used</span>
                              </div>
                              {/* Stock bar */}
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-2 rounded bg-emerald-400 transition-all duration-500"
                                  style={{ width: `${Math.max(stockPct, 2)}%` }}
                                />
                                <span className="text-[10px] text-slate-400">Available</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Replenishment Checklist & Recommendations */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Replenishment Recommendations</h3>
                    <p className="text-xs text-slate-400 mb-4">Stock items requiring immediate orders.</p>
                  </div>

                  <div className="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[220px] mb-4 pr-1">
                    {stockItems.filter(item => item.quantity <= 5).length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-xs">
                        All stock items are well supplied! No replenishment orders needed.
                      </div>
                    ) : (
                      stockItems
                        .filter(item => item.quantity <= 5)
                        .map(item => (
                          <div key={item.id} className="flex items-center justify-between border-b border-slate-50 pb-2.5 last:border-0 last:pb-0">
                            <div>
                              <p className="text-sm font-bold text-slate-800 leading-snug">{item.name}</p>
                              <p className="text-xs text-slate-400">Location: {item.location} • Category: {item.category}</p>
                            </div>
                            <div className="text-right">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                                item.quantity === 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {item.quantity === 0 ? 'Out' : `${item.quantity} Left`}
                              </span>
                            </div>
                          </div>
                        ))
                    )}
                  </div>

                  <div className="rounded-xl bg-[#14B8A6]/5 p-4 border border-[#14B8A6]/10">
                    <h4 className="text-xs font-bold text-[#14B8A6] uppercase tracking-wider mb-1">Ordering Insight</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Based on usage, the most consumed category is{' '}
                      <strong>
                        {analytics.categoryStats.length > 0
                          ? analytics.categoryStats.reduce((max, s) => (s.total_used > max.total_used ? s : max), analytics.categoryStats[0]).category
                          : 'N/A'}
                      </strong>
                      . Plan bulk purchases for this category to benefit from volume discounts and ensure engineers have required parts on-site.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── STOCK MODAL ─── */}
      {showStockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editingStockItem ? 'Edit Stock Item' : 'Add Stock Item'}
              </h2>
              <button
                onClick={() => setShowStockModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStock} className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">
              {errorMsg && (
                <div className="rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-100 flex items-center gap-2">
                  <AlertTriangle className="size-4 shrink-0" />
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Part Name *</label>
                <input
                  type="text"
                  required
                  value={stockForm.name}
                  onChange={(e) => setStockForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. 13A Double Socket Outlet"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">MPN / Part Number</label>
                  <input
                    type="text"
                    value={stockForm.mpn}
                    onChange={(e) => setStockForm((prev) => ({ ...prev, mpn: e.target.value }))}
                    placeholder="e.g. SF2000"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={stockForm.quantity}
                    onChange={(e) => setStockForm((prev) => ({ ...prev, quantity: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Category</label>
                  <select
                    value={stockForm.category}
                    onChange={(e) => setStockForm((prev) => ({ ...prev, category: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  >
                    {STOCK_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Quality</label>
                  <select
                    value={stockForm.quality}
                    onChange={(e) => setStockForm((prev) => ({ ...prev, quality: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  >
                    {QUALITIES.map(q => (
                      <option key={q} value={q}>{q}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Location</label>
                  <select
                    value={stockForm.location}
                    onChange={(e) => setStockForm((prev) => ({ ...prev, location: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  >
                    {locations.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Photo Upload */}
              <div className="border-t border-slate-100 pt-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Upload Part Picture</label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center size-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 relative">
                    {stockForm.image_base64 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={stockForm.image_base64} alt="Preview" className="size-full object-cover" />
                    ) : (editingStockItem?.image_url && activeToken) ? (
                      <AuthenticatedStockImage
                        imageUrl={editingStockItem.image_url}
                        category="stock-photos"
                        token={activeToken}
                        alt="Preview"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Upload className="size-6 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      id="stock-image-input"
                      onChange={handleStockFileChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="stock-image-input"
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-sm"
                    >
                      <Upload className="size-3.5" /> Select image
                    </label>
                    <p className="text-[10px] text-slate-400 mt-1">PNG, JPG, JPEG formats accepted.</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
                <button
                  type="button"
                  onClick={() => setShowStockModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] shadow-sm transition"
                >
                  Save Part
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── TOOL MODAL ─── */}
      {showToolModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editingTool ? 'Edit Tool Details' : 'Register New Tool'}
              </h2>
              <button
                onClick={() => setShowToolModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTool} className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">
              {errorMsg && (
                <div className="rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-100 flex items-center gap-2">
                  <AlertTriangle className="size-4 shrink-0" />
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Tool Name *</label>
                <input
                  type="text"
                  required
                  value={toolForm.name}
                  onChange={(e) => setToolForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. DeWalt DCD796 Hammer Drill"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Category</label>
                  <select
                    value={toolForm.category}
                    onChange={(e) => setToolForm((prev) => ({ ...prev, category: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  >
                    {TOOL_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Location</label>
                  <select
                    value={toolForm.location}
                    onChange={(e) => setToolForm((prev) => ({ ...prev, location: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  >
                    {locations.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Status</label>
                  <select
                    value={toolForm.status}
                    onChange={(e) => setToolForm((prev) => ({ ...prev, status: e.target.value as any }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  >
                    <option value="available">Available</option>
                    <option value="in_use">In Use</option>
                    <option value="damaged">Damaged</option>
                    <option value="missing">Missing</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Custodian (Officer)</label>
                  <select
                    value={toolForm.assigned_officer_id}
                    onChange={(e) => setToolForm((prev) => ({ ...prev, assigned_officer_id: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  >
                    <option value="">None Assigned</option>
                    {officers.map(off => (
                      <option key={off.id} value={off.id}>{off.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Photo Upload */}
              <div className="border-t border-slate-100 pt-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Upload Tool Picture</label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center size-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 relative">
                    {toolForm.image_base64 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={toolForm.image_base64} alt="Preview" className="size-full object-cover" />
                    ) : (editingTool?.image_url && activeToken) ? (
                      <AuthenticatedStockImage
                        imageUrl={editingTool.image_url}
                        category="tool-photos"
                        token={activeToken}
                        alt="Preview"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Upload className="size-6 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      id="tool-image-input"
                      onChange={handleToolFileChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="tool-image-input"
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-sm"
                    >
                      <Upload className="size-3.5" /> Select image
                    </label>
                    <p className="text-[10px] text-slate-400 mt-1">PNG, JPG, JPEG formats accepted.</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
                <button
                  type="button"
                  onClick={() => setShowToolModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] shadow-sm transition"
                >
                  Save Tool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showLocationSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowLocationSettings(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900">Stock location options</h3>
            <p className="mt-1 text-sm text-slate-500">One location per line. These appear in the Location dropdown when adding stock or tools.</p>
            <textarea
              value={locationDraft}
              onChange={(e) => setLocationDraft(e.target.value)}
              rows={6}
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLocationSettings(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingLocations}
                onClick={() => void saveLocationOptions()}
                className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] disabled:opacity-50"
              >
                {savingLocations ? 'Saving…' : 'Save locations'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
