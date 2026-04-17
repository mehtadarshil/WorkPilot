'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, subMonths, addMonths, isSameMonth, isSameDay, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight, UserCircle2, CalendarDays, Map as MapIcon, Users, X } from 'lucide-react';
import { getJson, postJson } from '../../apiClient';

interface DiaryEvent {
  diary_id: number;
  job_id: number;
  officer_id: number | null;
  officer_full_name: string | null;
  start_time: string;
  duration_minutes: number;
  event_status: string;
  title: string;
  customer_full_name: string;
  customer_address: string;
}

interface Officer {
  id: number;
  full_name: string;
}

interface JobDetails {
  id: number;
  customer_full_name: string;
  title: string;
  description_name: string;
}

// Reusable MiniCalendar
function MiniCalendar({ date, onSelect, activeDate }: { date: Date, onSelect: (d: Date) => void, activeDate: Date }) {
  const monthStart = startOfMonth(activeDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = [];
  let day = startDate;
  while (day <= endDate) {
    calendarDays.push(day);
    day = addDays(day, 1);
  }

  const weeks = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-2 px-1">
        <button onClick={() => onSelect(subMonths(activeDate, 1))} className="text-slate-400 hover:text-slate-700"><ChevronLeft className="size-4" /></button>
        <span className="text-[13px] font-bold text-slate-700">{format(activeDate, "MMMM yyyy")}</span>
        <button onClick={() => onSelect(addMonths(activeDate, 1))} className="text-slate-400 hover:text-slate-700"><ChevronRight className="size-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[11px] font-bold text-slate-400 mb-2 text-center">
        {dayNames.map(n => <div key={n}>{n}</div>)}
      </div>
      {weeks.map((week, wIndex) => (
        <div key={`week-${format(week[0], 'yyyy-MM-dd')}`} className="grid grid-cols-7 gap-1 mb-1">
          {week.map((d, dIndex) => {
            const isToday = isSameDay(d, new Date());
            const active = isSameDay(d, date);
            return (
              <div key={`cell-${format(d, 'yyyy-MM-dd')}-${wIndex}-${dIndex}`}
                onClick={() => onSelect(d)}
                className={`flex items-center justify-center p-1 text-[12px] font-medium cursor-pointer aspect-square transition-colors ${!isSameMonth(d, monthStart) ? "text-slate-300" : "text-slate-700"} ${active ? "bg-[#14B8A6] text-white" : "hover:bg-slate-100"}`}
              >
                {format(d, "d")}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function DiaryPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialJobId = searchParams.get('jobId');

  const [date, setDate] = useState(new Date());
  const [activeMonthDate, setActiveMonthDate] = useState(new Date());
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [events, setEvents] = useState<DiaryEvent[]>([]);
  const [highlightedJob, setHighlightedJob] = useState<JobDetails | null>(null);

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    start_time: '',
    duration_minutes: 60,
    officer_id: '',
    notes: ''
  });

  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [officerRes, eventsRes] = await Promise.all([
        getJson<{ officers: Officer[] }>('/officers/list', token),
        getJson<{ events: DiaryEvent[] }>(`/diary-events?from=${format(date, 'yyyy-MM-dd')}&to=${format(date, 'yyyy-MM-dd')}`, token)
      ]);
      setOfficers(officerRes.officers || []);
      setEvents(eventsRes.events || []);
    } catch (e) {
      console.error(e);
    }
  }, [date, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (initialJobId && token) {
      getJson<{ job: JobDetails }>(`/jobs/${initialJobId}`, token)
        .then(res => setHighlightedJob(res.job))
        .catch(console.error);
    }
  }, [initialJobId, token]);

  // Handle clicking on the grid
  const handleSlotClick = (officer: Officer, hour: number, blockPart: number) => {
    if (!highlightedJob) {
      alert("Please select a job to schedule an event for first. (You can do this from the Jobs directory)");
      return;
    }
    
    // Construct local datetime for input
    const targetDate = new Date(date);
    targetDate.setHours(hour, blockPart * 30, 0, 0); // either 0 or 30 mins
    
    const tzOffsetMs = targetDate.getTimezoneOffset() * 60000;
    const localISOTime = new Date(targetDate.getTime() - tzOffsetMs).toISOString().slice(0, 16);

    setScheduleForm({
      start_time: localISOTime,
      duration_minutes: 60,
      officer_id: String(officer.id),
      notes: ''
    });
    setScheduleModalOpen(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !highlightedJob) return;

    try {
      await postJson(
        `/jobs/${highlightedJob.id}/diary-events`,
        {
          start_time: new Date(scheduleForm.start_time).toISOString(),
          duration_minutes: scheduleForm.duration_minutes,
          officer_id: parseInt(scheduleForm.officer_id, 10),
          notes: scheduleForm.notes
        },
        token
      );
      setScheduleModalOpen(false);
      fetchData(); // Reload events
    } catch (error) {
      console.error(error);
      alert("Failed to schedule diary event");
    }
  };

  const dayStartHour = 8;
  const dayEndHour = 18; // 8 am to 6 pm
  const hoursCount = dayEndHour - dayStartHour;

  return (
    <div className="flex h-screen flex-col bg-[#F8FAFC]">
      {/* Top Header mimicking the view */}
      <div className="bg-[#46698b] text-white flex items-center px-4 overflow-x-auto text-sm shrink-0">
        <button className="px-6 py-3 font-semibold bg-white text-[#46698b]">Diary</button>
        <button className="px-6 py-3 hover:bg-white/10 transition">Suppliers</button>
        <button className="px-6 py-3 hover:bg-white/10 transition">Fleet management</button>
        <button className="px-6 py-3 hover:bg-white/10 transition">Reporting</button>
      </div>

      <div className="flex-1 flex flex-col p-4 bg-white overflow-hidden">
        
        {/* Toolbar */}
        <div className="flex justify-between items-center mb-4 text-sm">
          <h1 className="text-[15px] font-bold text-slate-800">{format(date, 'EEEE do MMMM yyyy')}</h1>
          <div className="flex bg-slate-100 rounded border border-slate-200 text-slate-600">
            <button className="px-4 py-1.5 hover:bg-slate-200 border-r border-slate-200">Suggested appointment</button>
            <button className="px-4 py-1.5 hover:bg-slate-200 border-r border-slate-200">Map</button>
            <button className="px-4 py-1.5 bg-white font-bold border-r border-slate-200 shadow-sm">Daily</button>
            <button className="px-4 py-1.5 hover:bg-slate-200 border-r border-slate-200">Weekly</button>
            <button className="px-4 py-1.5 hover:bg-slate-200 border-r border-slate-200">Two weekly</button>
            <button className="px-4 py-1.5 hover:bg-slate-200">Monthly</button>
          </div>
        </div>

        {/* Main Grid Area */}
        <div className="flex-1 border border-slate-300 rounded shadow-sm flex overflow-hidden">
          
          {/* Left: Timetable */}
          <div className="flex-1 flex flex-col bg-white overflow-y-auto">
            {/* Grid Header */}
            <div className="flex items-center border-b border-slate-300 shrink-0 sticky top-0 bg-white z-20">
              <div className="w-[180px] shrink-0 p-3 font-bold text-slate-700 text-sm border-r border-slate-300">Users</div>
              <div className="flex-1 flex">
                {Array.from({ length: hoursCount }).map((_, i) => (
                  <div key={i} className="flex-1 p-2 font-bold text-slate-700 text-sm border-r border-slate-200 last:border-0 relative">
                    {format(new Date().setHours(dayStartHour + i), 'ha').toLowerCase()}
                  </div>
                ))}
              </div>
            </div>

            {/* Grid Body */}
            <div className="flex-1 relative pb-10">
               {/* Background Columns */}
               <div className="absolute inset-0 left-[180px] flex pointer-events-none z-0">
                  {Array.from({ length: hoursCount }).map((_, i) => (
                    <div key={i} className="flex-1 border-r border-slate-200 last:border-0 h-full flex">
                       {/* Half-hour divider */}
                       <div className="w-1/2 border-r border-slate-100 h-full"></div>
                    </div>
                  ))}
               </div>

               {/* Rows */}
               {officers.map(officer => {
                 const officerEvents = events.filter(e => e.officer_id === officer.id && isSameDay(new Date(e.start_time), date));
                 return (
                   <div key={officer.id} className="flex border-b border-slate-200 min-h-[80px] relative z-10">
                     {/* Officer Name Cell */}
                     <div className="w-[180px] shrink-0 p-3 font-bold text-slate-600 text-[13px] border-r border-slate-300 bg-white flex items-center shadow-[1px_0_0_rgba(0,0,0,0.05)] z-20">
                       {officer.full_name}
                     </div>
                     {/* Time Slots Area */}
                     <div className="flex-1 flex relative">
                        {Array.from({ length: hoursCount }).map((_, hourOffset) => (
                          <div key={hourOffset} className="flex-1 flex">
                             <div 
                               className={`flex-1 hover:bg-[#14B8A6]/10 cursor-pointer transition-colors ${highlightedJob ? '' : 'cursor-not-allowed'}`} 
                               onClick={() => handleSlotClick(officer, dayStartHour + hourOffset, 0)}
                             />
                             <div 
                               className={`flex-1 hover:bg-[#14B8A6]/10 cursor-pointer transition-colors ${highlightedJob ? '' : 'cursor-not-allowed'}`} 
                               onClick={() => handleSlotClick(officer, dayStartHour + hourOffset, 1)}
                             />
                          </div>
                        ))}
                        
                        {/* Render Events */}
                        {officerEvents.map(evt => {
                           const s = new Date(evt.start_time);
                           const startTotalMins = s.getHours() * 60 + s.getMinutes();
                           const offsetMins = startTotalMins - (dayStartHour * 60);
                           const totalDayMins = hoursCount * 60;
                           
                           let leftPct = (offsetMins / totalDayMins) * 100;
                           if (leftPct < 0) leftPct = 0;
                           
                           let widthPct = (evt.duration_minutes / totalDayMins) * 100;
                           if (leftPct + widthPct > 100) widthPct = 100 - leftPct;
                           
                           if (leftPct > 100) return null;

                           return (
                             <div 
                               key={evt.diary_id}
                               className="absolute top-1 bottom-1 bg-white border-l-4 border-l-slate-400 border border-slate-200 rounded shadow-sm p-1.5 text-[11px] overflow-hidden leading-tight flex flex-col z-30 opacity-90 hover:opacity-100 hover:shadow-md transition-shadow"
                               style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                             >
                               <div className="font-bold text-slate-700 flex justify-between">
                                  <span>{format(s, 'HH:mm')} - {format(new Date(s.getTime() + evt.duration_minutes*60000), 'HH:mm')}</span>
                                  <X className="size-3 text-slate-400 cursor-pointer hover:text-red-500" />
                               </div>
                               <div className="text-slate-600 truncate mt-0.5">{evt.customer_full_name}</div>
                               <div className="text-slate-500 truncate">{evt.customer_address || 'Address not listed'}</div>
                             </div>
                           )
                        })}
                     </div>
                   </div>
                 );
               })}
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="w-[280px] w-max-[30%] shrink-0 border-l border-slate-300 bg-white flex flex-col overflow-y-auto">
             
             {/* Date Picker Header */}
             <div className="p-4 border-b border-slate-200">
               <div className="flex justify-end gap-1 mb-3">
                 <button className="border border-slate-200 text-xs px-2 py-1 rounded text-slate-600 hover:bg-slate-50" onClick={() => setDate(new Date())}>Today</button>
                 <button className="border border-slate-200 text-xs px-2 py-1 rounded text-slate-600 hover:bg-slate-50" onClick={() => setDate(subMonths(date, 1))}><ChevronLeft className="size-3"/></button>
                 <button className="border border-slate-200 text-xs px-2 py-1 rounded text-slate-600 hover:bg-slate-50" onClick={() => setDate(addMonths(date, 1))}><ChevronRight className="size-3"/></button>
               </div>
               <MiniCalendar 
                  date={date} 
                  onSelect={(d) => { setDate(d); setActiveMonthDate(d); }} 
                  activeDate={activeMonthDate} 
               />
             </div>

             {/* Job Context Alert */}
             {highlightedJob && (
               <div className="p-4 border-b border-slate-200">
                 <p className="text-[#15803d] text-[13px] italic font-medium">
                   You have just come from job no. {highlightedJob.id.toString().padStart(4, '0')}. To add this job to the diary you need to select a time slot for it. <br/>
                   <span className="opacity-80 mt-1 block">(Just like you do when adding a new event)</span>
                 </p>
                 <button 
                    onClick={() => { setHighlightedJob(null); router.replace('/dashboard/diary'); }}
                    className="mt-3 text-xs text-[#15803d] font-bold underline hover:text-green-800"
                 >
                   Clear context
                 </button>
               </div>
             )}

             {/* Filters */}
             <div className="p-4">
                <h4 className="font-bold text-slate-700 text-sm mb-3">Filters</h4>
                <div className="space-y-3">
                    <button className="flex items-center justify-between w-full text-left text-[13px] text-[#4a729e] font-semibold hover:underline">
                        <div className="flex items-center gap-2"><Users className="size-4"/> Users</div>
                        <span className="text-slate-400 font-normal">({officers.length} out of {officers.length})</span>
                    </button>
                    <button className="flex items-center justify-between w-full text-left text-[13px] text-[#4a729e] font-semibold hover:underline">
                        <div className="flex items-center gap-2"><UserCircle2 className="size-4"/> User groups</div>
                    </button>
                    <button className="flex items-center justify-between w-full text-left text-[13px] text-[#4a729e] font-semibold hover:underline">
                        <div className="flex items-center gap-2"><CalendarDays className="size-4"/> Skills</div>
                        <span className="text-slate-400 font-normal">(selected 1 out of 6)</span>
                    </button>
                </div>
                
                <h4 className="font-bold text-slate-700 text-sm mt-8 mb-3">More</h4>
                <button className="flex items-center gap-2 w-full text-left text-[13px] text-[#4a729e] font-semibold hover:underline">
                  <MapIcon className="size-4"/> Nearby events
                </button>
             </div>
          </div>
        </div>
      </div>

      {scheduleModalOpen && highlightedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded shadow-xl w-[400px] p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Add Diary Event</h3>
            <p className="text-sm font-semibold text-slate-600 mb-4 bg-slate-100 p-2 rounded">Job: {highlightedJob.description_name || highlightedJob.title}</p>
            <form onSubmit={handleSaveEvent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Date & Time</label>
                <p className="mt-1 text-xs text-slate-500">
                  The diary grid only picks half-hour slots for speed—set the exact start time here (any minute).
                </p>
                <input 
                   type="datetime-local" 
                   value={scheduleForm.start_time} 
                   onChange={(e) => setScheduleForm({...scheduleForm, start_time: e.target.value})}
                   className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm"
                   required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Duration (mins)</label>
                <input 
                   type="number" 
                   step="15"
                   value={scheduleForm.duration_minutes} 
                   onChange={(e) => setScheduleForm({...scheduleForm, duration_minutes: parseInt(e.target.value, 10)})}
                   className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm"
                   required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Engineer</label>
                <select 
                   value={scheduleForm.officer_id}
                   onChange={(e) => setScheduleForm({...scheduleForm, officer_id: e.target.value})}
                   className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm"
                   required
                >
                   {officers.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setScheduleModalOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm font-bold text-white bg-[#14B8A6] rounded hover:brightness-110">Save Event</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
